// ---- Domain types for personal-finance-lite (crop-farm planning) ----
//
// DESIGN SKETCH — for review, not wired into an app yet.
//
// Conventions (matching garden-lite):
//   * dates           ISO "yyyy-mm-dd" strings
//   * timestamps      ISO datetime strings (createdAt / updatedAt)
//   * money           INTEGER rupiah (no decimals, no floats) e.g. 30000 = Rp 30k
//   * area            fractional number in hectares (0.5 = half a hectare)
//   * yield / weight  number in kilograms
//   * singletons      literal id type, e.g. id: "settings"
//   * collections     auto-increment numeric id (Dexie "++id")

export type Money = number; // integer rupiah
export type IsoDate = string; // "yyyy-mm-dd"
export type IsoDateTime = string; // full ISO timestamp

// ---- Settings (singleton) ----

export interface Settings {
  id: "settings";
  githubToken?: string;
  gistId?: string; // gist used for sync
  theme?: string;
  currency: string; // "IDR" — label only; amounts are always integer rupiah
}

// =====================================================================
//  Catalog: a Crop is a reusable type (shallot, chili...). Cycles and
//  price observations reference it. Kept thin on purpose.
// =====================================================================

export interface Crop {
  id?: number;
  name: string; // "Shallot"
  localName?: string; // "Bawang merah"
  unit: "kg"; // room to grow later; kg for now
  note?: string;
  createdAt: IsoDateTime;
}

// =====================================================================
//  CropCycle: THE planning unit. One crop, one plot, one season.
//  Costs live in their own table (see CostItem) keyed by cycleId.
// =====================================================================

/** Yield is uncertain, so it is always a 3-point band, never a single number. */
export interface YieldBand {
  worstKg: number;
  expectedKg: number; // drives the headline figures
  bestKg: number;
}

export type CycleStatus = "planned" | "growing" | "harvested";

export interface CropCycle {
  id?: number;
  cropId: number;
  label: string; // "Shallot - rainy season plot A"
  plotName?: string; // free text for v1; a Plot table can be extracted later

  /** How the planting is sized. Polybag growers count bags; field growers
   *  use hectares. scaleUnit is a label AND the basis for "perUnit" costs. */
  scaleCount: number; // e.g. 500 (polybags) or 1 (hectare)
  scaleUnit: string; // "polybag" | "ha" | "m2" | "plant" | "tree"

  plantDate: IsoDate;
  harvestDate: IsoDate; // estimated while planned; actual once harvested

  yield: YieldBand; // planning assumption (kg)

  /** Expected market price at harvest (integer rupiah/kg). Seeded from
   *  PriceObservation history; overridable per scenario. */
  expectedPricePerKg: Money;

  status: CycleStatus;

  // ---- Actuals (v2; reserved now so calc can prefer them later) ----
  actualYieldKg?: number;
  actualHarvestDate?: IsoDate;

  createdAt: IsoDateTime;
}

// ---- Costs attached to a cycle ----

export type CostCategory =
  | "seed"
  | "media" // soil / compost / the polybag itself
  | "land"
  | "labor"
  | "fertilizer"
  | "pesticide"
  | "irrigation"
  | "other";

/**
 * basis distinguishes the three cost shapes that matter for break-even:
 *   "perCycle" — committed once regardless of size/yield (land rent, tools).
 *                amount = total for the cycle.
 *   "perUnit"  — scales with the number of production units, i.e. scaleCount
 *                (soil + bag + seedling per polybag). amount = rupiah/unit.
 *   "perKg"    — scales with harvested weight (packing, transport).
 *                amount = rupiah/kg.
 * perCycle and perUnit are both "committed" (known before harvest); only
 * perKg varies with the actual yield.
 */
export interface CostItem {
  id?: number;
  cycleId: number;
  label: string;
  category: CostCategory;
  basis: "perCycle" | "perUnit" | "perKg";
  amount: Money; // perCycle: total; perUnit: rupiah/unit; perKg: rupiah/kg
  spentOn?: IsoDate; // when the cash actually leaves — feeds cashflow/runway
  createdAt: IsoDateTime;
}

// =====================================================================
//  Overhead: business-level shared fixed costs (rent, utilities, tools)
//  that don't belong to one cycle. Stored as a monthly amount and
//  allocated to each cycle by how many months that cycle runs, so the
//  per-cycle break-even reflects a fair share of overhead.
//  For durable tools, enter price / lifespan-in-months as the monthly amount.
// =====================================================================

export interface Overhead {
  id?: number;
  label: string; // "Yard rent", "Sprayer (amortized)"
  amountPerMonth: Money; // integer rupiah per month
  note?: string;
  createdAt: IsoDateTime;
}

// =====================================================================
//  PriceObservation: 5-second log of a market price you asked about.
//  Pure local data; over seasons these roll up into a per-crop curve
//  that seeds expectedPricePerKg on future cycles.
// =====================================================================

export interface PriceObservation {
  id?: number;
  cropId: number;
  date: IsoDate;
  pricePerKg: Money;
  location?: string;
  note?: string;
  createdAt: IsoDateTime;
}

// =====================================================================
//  Scenario: a NAMED OVERLAY over the base data (the diff IS the answer).
//  Stores only overrides; everything else inherits live from base.
//  One level deep, no scenario-of-scenario.
// =====================================================================

export type ScenarioOverride =
  // bump a numeric field on a cycle (yield band point, area, expected price)
  | {
      kind: "cycleField";
      cycleId: number;
      field: "worstKg" | "expectedKg" | "bestKg" | "scaleCount" | "expectedPricePerKg";
      value: number;
    }
  // change a single cost line's amount
  | { kind: "costAmount"; costId: number; value: Money }
  // exclude a cost or a whole cycle from this scenario ("lean mode")
  | { kind: "disableCost"; costId: number }
  | { kind: "disableCycle"; cycleId: number };

export interface Scenario {
  id?: number;
  name: string; // "Rent +20%", "Premium pricing", "Drop chili"
  note?: string;
  overrides: ScenarioOverride[];
  createdAt: IsoDateTime;
}
