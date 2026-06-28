// ---- Backup: export/import all user data as a single JSON blob ----
//
// NOTE: unlike a flat dataset, our tables are relational (costs -> cycleId,
// cycles -> cropId, prices -> cropId, scenario overrides -> cost/cycle ids).
// So on import we PRESERVE ids (clear-then-bulkAdd with inbound keys) to keep
// those references intact. Secrets (githubToken/gistId) are never written to
// the backup.

import { db, getSettings, saveSettings } from "../db/db";
import type {
  Crop,
  CropCycle,
  CostItem,
  Overhead,
  PriceObservation,
  Scenario,
  Withdrawal,
} from "./types";

export const APP = "finance-lite";
export const BACKUP_VERSION = 2;

export interface BackupData {
  app: typeof APP;
  version: number;
  exportedAt: string;
  currency: string;
  crops: Crop[];
  cycles: CropCycle[];
  costs: CostItem[];
  prices: PriceObservation[];
  scenarios: Scenario[];
  overheads: Overhead[];
  withdrawals: Withdrawal[];
}

export interface ImportCounts {
  crops: number;
  cycles: number;
  costs: number;
  prices: number;
  scenarios: number;
  overheads: number;
  withdrawals: number;
}

/** Serialize all user data. Secrets are intentionally excluded. */
export async function exportData(): Promise<BackupData> {
  const [settings, crops, cycles, costs, prices, scenarios, overheads, withdrawals] =
    await Promise.all([
      getSettings(),
      db.crops.toArray(),
      db.cycles.toArray(),
      db.costs.toArray(),
      db.prices.toArray(),
      db.scenarios.toArray(),
      db.overheads.toArray(),
      db.withdrawals.toArray(),
    ]);
  return {
    app: APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    currency: settings.currency,
    crops,
    cycles,
    costs,
    prices,
    scenarios,
    overheads,
    withdrawals,
  };
}

export async function exportJSON(): Promise<string> {
  return JSON.stringify(await exportData(), null, 2);
}

function isBackup(x: unknown): x is BackupData {
  return !!x && typeof x === "object" && (x as BackupData).app === APP;
}

/** Replace ALL local data with the backup. Local secrets are preserved. */
export async function importData(data: BackupData): Promise<ImportCounts> {
  await db.transaction(
    "rw",
    [db.crops, db.cycles, db.costs, db.prices, db.scenarios, db.overheads, db.withdrawals],
    async () => {
      await Promise.all([
        db.crops.clear(),
        db.cycles.clear(),
        db.costs.clear(),
        db.prices.clear(),
        db.scenarios.clear(),
        db.overheads.clear(),
        db.withdrawals.clear(),
      ]);
      // ids preserved so cropId / cycleId references stay valid.
      if (data.crops?.length) await db.crops.bulkAdd(data.crops);
      if (data.cycles?.length) await db.cycles.bulkAdd(data.cycles);
      if (data.costs?.length) await db.costs.bulkAdd(data.costs);
      if (data.prices?.length) await db.prices.bulkAdd(data.prices);
      if (data.scenarios?.length) await db.scenarios.bulkAdd(data.scenarios);
      if (data.overheads?.length) await db.overheads.bulkAdd(data.overheads);
      if (data.withdrawals?.length) await db.withdrawals.bulkAdd(data.withdrawals);
    },
  );
  // currency is non-secret; token/gistId stay as they are locally.
  if (data.currency) await saveSettings({ currency: data.currency });

  return {
    crops: data.crops?.length ?? 0,
    cycles: data.cycles?.length ?? 0,
    costs: data.costs?.length ?? 0,
    prices: data.prices?.length ?? 0,
    scenarios: data.scenarios?.length ?? 0,
    overheads: data.overheads?.length ?? 0,
    withdrawals: data.withdrawals?.length ?? 0,
  };
}

export async function importJSON(json: string): Promise<ImportCounts> {
  const parsed = JSON.parse(json);
  if (!isBackup(parsed)) throw new Error("Not a finance-lite backup file.");
  return importData(parsed);
}

/** Trigger a browser download of a text file. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
