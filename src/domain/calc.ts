// ---- Derived calculations for personal-finance-lite ----
//
// Everything here is PURE: (assumptions) -> numbers. Scenarios work by
// applying overrides to the inputs, then calling these same functions.

import type { CostItem, CropCycle, PriceObservation, Money } from "./types";

/**
 * A band mirrors the worst/expected/best yield band. "worst" always means
 * the worst outcome for the farmer (highest break-even price, lowest profit),
 * regardless of which yield point produced it.
 */
export interface Band<T = number> {
  worst: T;
  expected: T;
  best: T;
}

// ---------------------------------------------------------------------
//  Cost roll-ups
// ---------------------------------------------------------------------

/** Sum of all perCycle costs (committed once, independent of size & yield). */
export function fixedCycleCost(costs: CostItem[]): Money {
  return costs
    .filter((c) => c.basis === "perCycle")
    .reduce((sum, c) => sum + c.amount, 0);
}

/** Sum of all perUnit costs (rupiah per production unit, e.g. per polybag). */
export function perUnitCost(costs: CostItem[]): Money {
  return costs
    .filter((c) => c.basis === "perUnit")
    .reduce((sum, c) => sum + c.amount, 0);
}

/** Sum of all perKg costs (rupiah per kilogram harvested). */
export function variableCostPerKg(costs: CostItem[]): Money {
  return costs
    .filter((c) => c.basis === "perKg")
    .reduce((sum, c) => sum + c.amount, 0);
}

/**
 * Committed cost: everything known before harvest.
 *   committed = fixedCycleCost + perUnitCost * scaleCount
 * perUnit costs scale with the number of polybags/plants, not with yield, so
 * for break-even they behave like fixed cost once the planting size is set.
 */
export function committedCost(cycle: CropCycle, costs: CostItem[]): Money {
  return fixedCycleCost(costs) + perUnitCost(costs) * (cycle.scaleCount ?? 0);
}

/** total = committedCost + variableCostPerKg * kg */
export function totalCostAtYield(cycle: CropCycle, costs: CostItem[], kg: number): Money {
  return committedCost(cycle, costs) + variableCostPerKg(costs) * kg;
}

// ---------------------------------------------------------------------
//  The headline numbers
// ---------------------------------------------------------------------

/**
 * Break-even PRICE per kg — the floor you compare against the market.
 *   price(kg) = totalCostAtYield(kg) / kg
 * Worst yield => highest (worst) floor; best yield => lowest (best) floor.
 */
export function breakEvenPricePerKg(
  cycle: CropCycle,
  costs: CostItem[],
): Band<Money> {
  const at = (kg: number): Money => (kg > 0 ? totalCostAtYield(cycle, costs, kg) / kg : NaN);
  return {
    worst: at(cycle.yield.worstKg),
    expected: at(cycle.yield.expectedKg),
    best: at(cycle.yield.bestKg),
  };
}

/**
 * Break-even YIELD — kg to harvest to cover cost at the expected market price.
 *   breakEvenKg = committedCost / (price - variableCostPerKg)
 * null if price <= variable cost (every kg loses money).
 */
export function breakEvenYieldKg(cycle: CropCycle, costs: CostItem[]): number | null {
  const margin = cycle.expectedPricePerKg - variableCostPerKg(costs);
  if (margin <= 0) return null;
  return committedCost(cycle, costs) / margin;
}

/**
 * Profit at the cycle's expected market price, as a band over yield:
 *   profit(kg) = expectedPricePerKg * kg - totalCostAtYield(kg)
 */
export function profitAtExpectedPrice(
  cycle: CropCycle,
  costs: CostItem[],
): Band<Money> {
  const at = (kg: number): Money =>
    cycle.expectedPricePerKg * kg - totalCostAtYield(cycle, costs, kg);
  return {
    worst: at(cycle.yield.worstKg),
    expected: at(cycle.yield.expectedKg),
    best: at(cycle.yield.bestKg),
  };
}

/**
 * Risk line: the market price below which even a normal (expected-yield)
 * harvest loses money. Equals the expected break-even price.
 */
export function losesMoneyBelow(cycle: CropCycle, costs: CostItem[]): Money {
  return breakEvenPricePerKg(cycle, costs).expected;
}

// ---------------------------------------------------------------------
//  Price observations -> seasonal assumption
// ---------------------------------------------------------------------

/**
 * Monthly average price/kg from logged observations. Returns 12 entries
 * (month 0-11) -> average rupiah/kg, or null where no data exists.
 */
export function monthlyPriceCurve(observations: PriceObservation[]): (Money | null)[] {
  const sums = new Array(12).fill(0);
  const counts = new Array(12).fill(0);
  for (const o of observations) {
    const month = new Date(o.date).getMonth();
    if (Number.isNaN(month)) continue;
    sums[month] += o.pricePerKg;
    counts[month] += 1;
  }
  return sums.map((s, i) => (counts[i] > 0 ? Math.round(s / counts[i]) : null));
}

// ---------------------------------------------------------------------
//  Cashflow / runway (lumpy: spend over months, one harvest lump)
// ---------------------------------------------------------------------

export interface CashflowPoint {
  date: string; // yyyy-mm
  netCash: Money; // cumulative cash on hand at end of that month
}

/**
 * Cumulative cash over time: committed costs (perCycle + perUnit) leave on
 * spentOn (fallback plantDate); perKg costs and revenue land at harvest on
 * the expected yield. The minimum point is the deepest hole you must fund.
 */
export function cashflowTimeline(
  cycles: CropCycle[],
  costsByCycle: Map<number, CostItem[]>,
  startingCash: Money,
): CashflowPoint[] {
  const byMonth = new Map<string, Money>();
  const bump = (date: string, delta: Money) => {
    const key = date.slice(0, 7); // yyyy-mm
    byMonth.set(key, (byMonth.get(key) ?? 0) + delta);
  };

  for (const cycle of cycles) {
    const costs = costsByCycle.get(cycle.id ?? -1) ?? [];
    for (const c of costs) {
      if (c.basis === "perCycle") {
        bump(c.spentOn ?? cycle.plantDate, -c.amount);
      } else if (c.basis === "perUnit") {
        bump(c.spentOn ?? cycle.plantDate, -c.amount * (cycle.scaleCount ?? 0));
      }
    }
    // perKg costs and revenue realise at harvest on the expected yield.
    const kg = cycle.yield.expectedKg;
    const perKg = variableCostPerKg(costs);
    bump(cycle.harvestDate, -perKg * kg);
    bump(cycle.harvestDate, cycle.expectedPricePerKg * kg);
  }

  const months = [...byMonth.keys()].sort();
  let running = startingCash;
  return months.map((m) => {
    running += byMonth.get(m) ?? 0;
    return { date: m, netCash: running };
  });
}
