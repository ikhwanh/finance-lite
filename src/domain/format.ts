// ---- Formatting helpers ----

import type { Money } from "./types";

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/** 30000 -> "Rp 30.000". Handles negatives and null-ish gracefully. */
export function formatRupiah(n: Money | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return rupiah.format(Math.round(n));
}

/** Compact kg, trimming trailing zeros: 6000 -> "6.000 kg". */
export function formatKg(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return `${new Intl.NumberFormat("id-ID").format(Math.round(n))} kg`;
}
