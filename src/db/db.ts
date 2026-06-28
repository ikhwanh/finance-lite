// ---- Dexie schema + accessors for finance-lite ----
// Mirrors garden-lite's db.ts style.

import Dexie, { type Table } from "dexie";
import type {
  Crop,
  CropCycle,
  CostItem,
  Overhead,
  PriceObservation,
  Scenario,
  Settings,
} from "../domain/types";

export const DB_NAME = "finance-lite";

export class FinanceDB extends Dexie {
  settings!: Table<Settings, string>;
  crops!: Table<Crop, number>;
  cycles!: Table<CropCycle, number>;
  costs!: Table<CostItem, number>;
  prices!: Table<PriceObservation, number>;
  scenarios!: Table<Scenario, number>;
  overheads!: Table<Overhead, number>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      settings: "id",
      crops: "++id, name",
      cycles: "++id, cropId, status, plantDate, harvestDate",
      costs: "++id, cycleId, category",
      prices: "++id, cropId, date",
      scenarios: "++id, name",
    });
    this.version(2).stores({
      overheads: "++id",
    });
  }
}

export const db = new FinanceDB();

const now = (): string => new Date().toISOString();

// ---- Settings ----

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get("settings")) ?? { id: "settings", currency: "IDR" };
}

export async function saveSettings(
  patch: Partial<Omit<Settings, "id">>,
): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, ...patch, id: "settings" };
  await db.settings.put(next);
  return next;
}

// ---- Crops ----

export async function listCrops(): Promise<Crop[]> {
  return db.crops.orderBy("name").toArray();
}

/** Find a crop by (case-insensitive) name or create it. Returns its id. */
export async function findOrCreateCrop(name: string, localName?: string): Promise<number> {
  const trimmed = name.trim();
  const existing = (await db.crops.toArray()).find(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing?.id != null) return existing.id;
  return db.crops.add({
    name: trimmed,
    localName: localName?.trim() || undefined,
    unit: "kg",
    createdAt: now(),
  });
}

// ---- Cycles + their costs ----

export interface CycleWithCosts {
  cycle: CropCycle;
  costs: CostItem[];
}

export async function listCyclesWithCosts(): Promise<CycleWithCosts[]> {
  const cycles = await db.cycles.orderBy("plantDate").reverse().toArray();
  const all = await db.costs.toArray();
  return cycles.map((cycle) => ({
    cycle,
    costs: all.filter((c) => c.cycleId === cycle.id),
  }));
}

export type CycleInput = Omit<CropCycle, "id" | "createdAt">;
export type CostInput = Omit<CostItem, "id" | "cycleId" | "createdAt">;

/**
 * Create or update a cycle together with its cost lines, atomically.
 * Existing costs for the cycle are replaced wholesale (simplest correct
 * approach for a small per-cycle cost list).
 */
export async function saveCycleWithCosts(
  cycleInput: CycleInput,
  costInputs: CostInput[],
  existingId?: number,
): Promise<number> {
  return db.transaction("rw", db.cycles, db.costs, async () => {
    let cycleId: number;
    if (existingId != null) {
      const existing = await db.cycles.get(existingId);
      await db.cycles.put({
        ...cycleInput,
        id: existingId,
        createdAt: existing?.createdAt ?? now(),
      });
      cycleId = existingId;
      await db.costs.where("cycleId").equals(existingId).delete();
    } else {
      cycleId = (await db.cycles.add({ ...cycleInput, createdAt: now() })) as number;
    }
    if (costInputs.length > 0) {
      await db.costs.bulkAdd(
        costInputs.map((c) => ({ ...c, cycleId, createdAt: now() })),
      );
    }
    return cycleId;
  });
}

export async function deleteCycle(id: number): Promise<void> {
  await db.transaction("rw", db.cycles, db.costs, async () => {
    await db.costs.where("cycleId").equals(id).delete();
    await db.cycles.delete(id);
  });
}

// ---- Price observations -> per-crop curve ----

export async function listPricesForCrop(cropId: number): Promise<PriceObservation[]> {
  return db.prices.where("cropId").equals(cropId).sortBy("date");
}

export async function listAllPrices(): Promise<PriceObservation[]> {
  return db.prices.orderBy("date").reverse().toArray();
}

export async function addPriceObservation(
  p: Omit<PriceObservation, "id" | "createdAt">,
): Promise<number> {
  return db.prices.add({ ...p, createdAt: now() });
}

export async function deletePriceObservation(id: number): Promise<void> {
  await db.prices.delete(id);
}

// ---- Overheads (business-level shared fixed costs) ----

export async function listOverheads(): Promise<Overhead[]> {
  return db.overheads.orderBy("id").toArray();
}

export async function addOverhead(
  o: Omit<Overhead, "id" | "createdAt">,
): Promise<number> {
  return db.overheads.add({ ...o, createdAt: now() });
}

export async function deleteOverhead(id: number): Promise<void> {
  await db.overheads.delete(id);
}

/** Sum of all overhead monthly amounts — the pool allocated across cycles. */
export async function getMonthlyOverhead(): Promise<number> {
  const all = await db.overheads.toArray();
  return all.reduce((sum, o) => sum + o.amountPerMonth, 0);
}
