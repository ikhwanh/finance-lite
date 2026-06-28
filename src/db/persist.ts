// ---- Opt-in persistent storage (StorageManager API) ----
// By default browser storage is "best-effort": the browser may evict an
// origin's IndexedDB under disk pressure (or, in WebKit, after ~7 days of no
// visits) without asking the user. Since finance-lite keeps the user's data
// only in IndexedDB unless they sync to a gist, that eviction means data loss.
// Requesting persistence opts the origin out of automatic eviction — only the
// user can then clear the data manually.

export type PersistState = "persisted" | "transient" | "unsupported";

export interface StorageStatus {
  state: PersistState;
  /** Bytes currently used by this origin, if the browser reports it. */
  usage?: number;
  /** Total bytes available to this origin, if the browser reports it. */
  quota?: number;
}

function supported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.storage &&
    typeof navigator.storage.persist === "function"
  );
}

/** Whether this origin's storage is already exempt from automatic eviction. */
export async function isPersisted(): Promise<boolean> {
  if (!supported() || typeof navigator.storage.persisted !== "function") return false;
  return navigator.storage.persisted();
}

/**
 * Ask the browser to make storage persistent. Returns true if persistence is
 * granted (either already on, or newly granted). Firefox prompts the user;
 * Chrome decides silently from engagement heuristics; Safari/WebKit grants it
 * when the site is added to the home screen. Safe to call repeatedly.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!supported()) return false;
  if (await isPersisted()) return true;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Current persistence state plus a usage/quota estimate for display. */
export async function getStorageStatus(): Promise<StorageStatus> {
  if (!supported()) return { state: "unsupported" };
  const state: PersistState = (await isPersisted()) ? "persisted" : "transient";
  let usage: number | undefined;
  let quota: number | undefined;
  if (typeof navigator.storage.estimate === "function") {
    try {
      const est = await navigator.storage.estimate();
      usage = est.usage;
      quota = est.quota;
    } catch {
      /* ignore — estimate is best-effort */
    }
  }
  return { state, usage, quota };
}

/**
 * Best-effort silent request at startup. On browsers that grant persistence
 * from heuristics (Chrome) this quietly secures storage with no UI; elsewhere
 * it's a no-op and the user can opt in explicitly from Settings.
 */
export async function ensurePersistenceOnStartup(): Promise<void> {
  if (!supported()) return;
  if (await isPersisted()) return;
  try {
    await navigator.storage.persist();
  } catch {
    /* ignore */
  }
}
