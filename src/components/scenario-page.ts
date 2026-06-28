import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { controls } from "../styles/shared";
import {
  listCyclesWithCosts,
  listCrops,
  getMonthlyOverhead,
  type CycleWithCosts,
} from "../db/db";
import type { Crop, CropCycle, CostItem } from "../domain/types";
import {
  breakEvenPricePerKg,
  breakEvenYieldKg,
  committedCost,
  profitAtExpectedPrice,
  withOverhead,
} from "../domain/calc";
import { formatRupiah, formatKg } from "../domain/format";

/**
 * A what-if variant: a thin overlay over the chosen base cycle. Only the
 * fields the user changed differ; everything else inherits from the base.
 * (In-memory for now; maps conceptually to the persisted Scenario overrides.)
 */
interface Variant {
  id: number;
  name: string;
  scaleCount?: number;
  pricePerKg?: number;
  expectedKg?: number; // worst/best scale proportionally with this
  costFactor: number; // multiplier on every cost line
}

interface Computed {
  committed: number;
  breakEvenPrice: number;
  breakEvenYield: number | null;
  profitExpected: number;
  profitWorst: number;
  profitBest: number;
}

let seq = 1;

@customElement("pf-scenario-page")
export class ScenarioPage extends LitElement {
  static override styles = [
    controls,
    css`
      :host {
        display: block;
        max-width: 1000px;
        margin: 0 auto;
      }
      .topbar {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        margin-bottom: 1rem;
      }
      .topbar h2 {
        margin: 0;
        font-size: 1.15rem;
      }
      .spacer {
        flex: 1;
      }
      .picker {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        margin-bottom: 1rem;
      }
      .picker label {
        margin: 0;
        white-space: nowrap;
      }
      .picker select {
        width: auto;
        min-width: 220px;
      }
      .cols {
        display: flex;
        gap: 0.8rem;
        overflow-x: auto;
        padding: 0.8rem 0 0.5rem;
      }
      .col {
        flex: 0 0 220px;
        background: var(--pf-surface);
        border: 1px solid var(--pf-border);
        border-radius: var(--pf-radius);
        padding: 0.9rem;
        position: relative;
        box-shadow: 0 1px 2px var(--pf-shadow);
      }
      .col.base {
        border-color: var(--pf-text-muted);
      }
      .col.best {
        border-color: var(--pf-primary);
        box-shadow: 0 0 0 1px var(--pf-primary);
      }
      .badge {
        position: absolute;
        top: -0.6rem;
        left: 0.9rem;
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        background: var(--pf-primary);
        color: var(--pf-primary-text);
        padding: 0.1rem 0.45rem;
        border-radius: 999px;
      }
      .col header {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        margin-bottom: 0.7rem;
      }
      .col header input {
        font-weight: 700;
        padding: 0.3rem 0.4rem;
      }
      .col header .title {
        font-weight: 700;
        flex: 1;
      }
      .col header button {
        padding: 0.2rem 0.4rem;
        font-size: 0.8rem;
      }
      .knob {
        margin-bottom: 0.5rem;
      }
      .knob label {
        margin-bottom: 0.15rem;
        font-size: 0.72rem;
      }
      .knob input {
        padding: 0.35rem 0.45rem;
        font-size: 0.85rem;
      }
      .knob input:disabled {
        opacity: 0.7;
      }
      .results {
        margin-top: 0.8rem;
        border-top: 1px solid var(--pf-border);
        padding-top: 0.6rem;
      }
      .res {
        display: flex;
        justify-content: space-between;
        gap: 0.4rem;
        font-size: 0.78rem;
        padding: 0.2rem 0;
      }
      .res .k {
        color: var(--pf-text-muted);
      }
      .res .v {
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .profit {
        margin-top: 0.5rem;
        font-size: 1.05rem;
        font-weight: 800;
      }
      .delta {
        font-size: 0.75rem;
        font-weight: 600;
      }
      .pos {
        color: var(--pf-ok);
      }
      .neg {
        color: var(--pf-danger);
      }
      .add {
        flex: 0 0 auto;
        align-self: center;
      }
      .empty {
        color: var(--pf-text-muted);
        text-align: center;
        padding: 2.5rem 1rem;
      }
    `,
  ];

  @state() private records: CycleWithCosts[] = [];
  @state() private crops: Crop[] = [];
  @state() private baseId: number | null = null;
  @state() private variants: Variant[] = [];
  @state() private monthlyOverhead = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    const [records, crops, monthlyOverhead] = await Promise.all([
      listCyclesWithCosts(),
      listCrops(),
      getMonthlyOverhead(),
    ]);
    this.records = records;
    this.crops = crops;
    this.monthlyOverhead = monthlyOverhead;
    if (this.baseId == null || !records.some((r) => r.cycle.id === this.baseId)) {
      this.baseId = records[0]?.cycle.id ?? null;
      this.variants = [];
    }
  }

  private get base(): CycleWithCosts | null {
    return this.records.find((r) => r.cycle.id === this.baseId) ?? null;
  }

  private cropName(cropId: number): string {
    return this.crops.find((c) => c.id === cropId)?.name ?? "Crop";
  }

  // ---- derive a concrete {cycle, costs} for base or a variant ----

  private derive(base: CycleWithCosts, v?: Variant): { cycle: CropCycle; costs: CostItem[] } {
    if (!v) return base;
    const ratio =
      v.expectedKg != null && base.cycle.yield.expectedKg > 0
        ? v.expectedKg / base.cycle.yield.expectedKg
        : 1;
    const cycle: CropCycle = {
      ...base.cycle,
      scaleCount: v.scaleCount ?? base.cycle.scaleCount,
      expectedPricePerKg: v.pricePerKg ?? base.cycle.expectedPricePerKg,
      yield: {
        worstKg: Math.round(base.cycle.yield.worstKg * ratio),
        expectedKg: v.expectedKg ?? base.cycle.yield.expectedKg,
        bestKg: Math.round(base.cycle.yield.bestKg * ratio),
      },
    };
    const costs: CostItem[] = base.costs.map((c) => ({
      ...c,
      amount: Math.round(c.amount * v.costFactor),
    }));
    return { cycle, costs };
  }

  private compute(base: CycleWithCosts, v?: Variant): Computed {
    const derived = this.derive(base, v);
    const cycle = derived.cycle;
    // overhead is business-level: added after any per-cycle cost ×factor.
    const costs = withOverhead(cycle, derived.costs, this.monthlyOverhead);
    const profit = profitAtExpectedPrice(cycle, costs);
    return {
      committed: committedCost(cycle, costs),
      breakEvenPrice: breakEvenPricePerKg(cycle, costs).expected,
      breakEvenYield: breakEvenYieldKg(cycle, costs),
      profitExpected: profit.expected,
      profitWorst: profit.worst,
      profitBest: profit.best,
    };
  }

  // ---- variant management ----

  private addVariant(): void {
    const base = this.base;
    if (!base) return;
    const n = this.variants.length + 1;
    this.variants = [...this.variants, { id: seq++, name: `What-if ${n}`, costFactor: 1 }];
  }

  private duplicate(v: Variant): void {
    this.variants = [...this.variants, { ...v, id: seq++, name: `${v.name} copy` }];
  }

  private removeVariant(id: number): void {
    this.variants = this.variants.filter((v) => v.id !== id);
  }

  private patch(id: number, p: Partial<Variant>): void {
    this.variants = this.variants.map((v) => (v.id === id ? { ...v, ...p } : v));
  }

  override render() {
    if (this.records.length === 0) {
      return html`
        ${this.renderTop()}
        <div class="empty">Create a crop cycle first, then come back to compare what-ifs.</div>
      `;
    }
    const base = this.base!;
    const baseC = this.compute(base);
    const all = [baseC, ...this.variants.map((v) => this.compute(base, v))];
    const bestProfit = Math.max(...all.map((c) => c.profitExpected));

    return html`
      ${this.renderTop()}
      <div class="cols">
        ${this.renderBaseCol(base, baseC, baseC.profitExpected === bestProfit)}
        ${this.variants.map((v) =>
          this.renderVariantCol(base, v, baseC, this.compute(base, v).profitExpected === bestProfit),
        )}
        <button class="primary add" @click=${this.addVariant}>+ What-if</button>
      </div>
    `;
  }

  private renderTop() {
    return html`
      <div class="topbar">
        <h2>Compare what-ifs</h2>
      </div>
      ${this.records.length > 0
        ? html`<div class="picker">
            <label>Base cycle</label>
            <select
              @change=${(e: Event) => {
                this.baseId = Number((e.target as HTMLSelectElement).value);
                this.variants = [];
              }}
            >
              ${this.records.map(
                (r) =>
                  html`<option value=${r.cycle.id} ?selected=${r.cycle.id === this.baseId}>
                    ${this.cropName(r.cycle.cropId)} — ${r.cycle.label}
                  </option>`,
              )}
            </select>
          </div>`
        : ""}
    `;
  }

  private renderBaseCol(base: CycleWithCosts, c: Computed, best: boolean) {
    const cy = base.cycle;
    return html`
      <div class="col base ${best ? "best" : ""}">
        ${best ? html`<span class="badge">Best</span>` : ""}
        <header><span class="title">Base (current)</span></header>
        ${this.knob("Bags", cy.scaleCount)} ${this.knob("Price Rp/kg", cy.expectedPricePerKg)}
        ${this.knob("Exp. yield kg", cy.yield.expectedKg)} ${this.knob("Cost ×", 1)}
        ${this.renderResults(c, c)}
      </div>
    `;
  }

  private renderVariantCol(base: CycleWithCosts, v: Variant, baseC: Computed, best: boolean) {
    const cy = base.cycle;
    const c = this.compute(base, v);
    return html`
      <div class="col ${best ? "best" : ""}">
        ${best ? html`<span class="badge">Best</span>` : ""}
        <header>
          <input
            .value=${v.name}
            @input=${(e: Event) => this.patch(v.id, { name: (e.target as HTMLInputElement).value })}
          />
          <button class="ghost" title="Duplicate" @click=${() => this.duplicate(v)}>⧉</button>
          <button class="ghost" title="Remove" @click=${() => this.removeVariant(v.id)}>✕</button>
        </header>
        ${this.knobInput("Bags", v.scaleCount, cy.scaleCount, (n) =>
          this.patch(v.id, { scaleCount: n }),
        )}
        ${this.knobInput("Price Rp/kg", v.pricePerKg, cy.expectedPricePerKg, (n) =>
          this.patch(v.id, { pricePerKg: n }),
        )}
        ${this.knobInput("Exp. yield kg", v.expectedKg, cy.yield.expectedKg, (n) =>
          this.patch(v.id, { expectedKg: n }),
        )}
        ${this.knobInput("Cost ×", v.costFactor === 1 ? undefined : v.costFactor, 1, (n) =>
          this.patch(v.id, { costFactor: n ?? 1 }),
        )}
        ${this.renderResults(c, baseC)}
      </div>
    `;
  }

  private knob(label: string, value: number) {
    return html`<div class="knob">
      <label>${label}</label>
      <input type="number" .value=${String(value)} disabled />
    </div>`;
  }

  private knobInput(
    label: string,
    value: number | undefined,
    placeholder: number,
    onChange: (n: number | undefined) => void,
  ) {
    return html`<div class="knob">
      <label>${label}</label>
      <input
        type="number"
        placeholder=${String(placeholder)}
        .value=${value == null ? "" : String(value)}
        @input=${(e: Event) => {
          const raw = (e.target as HTMLInputElement).value;
          onChange(raw === "" ? undefined : Number(raw));
        }}
      />
    </div>`;
  }

  private renderResults(c: Computed, baseC: Computed) {
    const delta = c.profitExpected - baseC.profitExpected;
    const isBase = c === baseC;
    return html`
      <div class="results">
        <div class="res">
          <span class="k">Committed</span><span class="v">${formatRupiah(c.committed)}</span>
        </div>
        <div class="res">
          <span class="k">Break-even</span
          ><span class="v">${formatRupiah(c.breakEvenPrice)}/kg</span>
        </div>
        <div class="res">
          <span class="k">B/E yield</span
          ><span class="v">${c.breakEvenYield == null ? "never" : formatKg(c.breakEvenYield)}</span>
        </div>
        <div class="profit ${c.profitExpected >= 0 ? "pos" : "neg"}">
          ${formatRupiah(c.profitExpected)}
        </div>
        ${isBase
          ? html`<div class="delta k" style="color:var(--pf-text-muted)">expected profit</div>`
          : html`<div class="delta ${delta >= 0 ? "pos" : "neg"}">
              ${delta >= 0 ? "+" : ""}${formatRupiah(delta)} vs base
            </div>`}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-scenario-page": ScenarioPage;
  }
}
