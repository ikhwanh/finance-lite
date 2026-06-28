import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { controls } from "../styles/shared";
import {
  findOrCreateCrop,
  saveCycleWithCosts,
  type CycleWithCosts,
  type CostInput,
} from "../db/db";
import type { CostCategory, CropCycle, CostItem } from "../domain/types";
import {
  breakEvenPricePerKg,
  breakEvenYieldKg,
  profitAtExpectedPrice,
  committedCost,
  perUnitCost,
  variableCostPerKg,
  withOverhead,
  allocatedOverhead,
  durationMonths,
} from "../domain/calc";
import { formatRupiah, formatKg } from "../domain/format";

type Basis = "perCycle" | "perUnit" | "perKg";

interface CostRow {
  clientId: number;
  label: string;
  category: CostCategory;
  basis: Basis;
  amount: string;
}

const SCALE_UNITS = ["polybag", "ha", "m2", "plant", "tree"];

/** Short label for the perUnit basis option, e.g. polybag -> "bag". */
function unitShort(unit: string): string {
  return unit === "polybag" ? "bag" : unit;
}

const CATEGORIES: CostCategory[] = [
  "seed",
  "media",
  "land",
  "labor",
  "fertilizer",
  "pesticide",
  "irrigation",
  "other",
];

let rowSeq = 1;

@customElement("pf-cycle-editor")
export class CycleEditor extends LitElement {
  static override styles = [
    controls,
    css`
      :host {
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.9fr);
        gap: 1.2rem;
        align-items: start;
      }
      @media (max-width: 820px) {
        :host {
          grid-template-columns: 1fr;
        }
      }
      .card {
        background: var(--pf-surface);
        border: 1px solid var(--pf-border);
        border-radius: var(--pf-radius);
        padding: 1.2rem;
        box-shadow: 0 1px 2px var(--pf-shadow);
      }
      h3 {
        margin: 0 0 1rem;
        font-size: 1.05rem;
      }
      .sub {
        font-size: 0.8rem;
        color: var(--pf-text-muted);
        margin: -0.5rem 0 0.9rem;
      }
      .costs-head,
      .cost-row {
        display: grid;
        grid-template-columns: 1.4fr 1fr 1fr auto;
        gap: 0.5rem;
        align-items: end;
      }
      .costs-head label {
        margin: 0 0 0.2rem;
      }
      .cost-row {
        margin-bottom: 0.6rem;
      }
      .cost-row button.del {
        padding: 0.5rem 0.6rem;
      }
      .add-cost {
        margin-top: 0.4rem;
      }
      .panel {
        position: sticky;
        top: 1rem;
      }
      .metric {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 0.5rem 0;
        border-bottom: 1px dashed var(--pf-border);
        gap: 0.6rem;
      }
      .metric:last-child {
        border-bottom: none;
      }
      .metric .k {
        font-size: 0.82rem;
        color: var(--pf-text-muted);
      }
      .metric .v {
        font-weight: 700;
        text-align: right;
        white-space: nowrap;
      }
      .band {
        display: flex;
        gap: 0.35rem;
        font-variant-numeric: tabular-nums;
        font-size: 0.8rem;
        color: var(--pf-text-muted);
      }
      .band b {
        color: var(--pf-text);
        font-weight: 700;
      }
      .verdict {
        margin-top: 1rem;
        padding: 0.8rem 1rem;
        border-radius: var(--pf-radius-sm);
        font-weight: 600;
      }
      .verdict.ok {
        background: color-mix(in srgb, var(--pf-ok) 16%, transparent);
        color: var(--pf-ok);
      }
      .verdict.loss {
        background: color-mix(in srgb, var(--pf-danger) 16%, transparent);
        color: var(--pf-danger);
      }
      .verdict small {
        display: block;
        font-weight: 400;
        margin-top: 0.25rem;
        color: var(--pf-text-muted);
      }
      .pos {
        color: var(--pf-ok);
      }
      .neg {
        color: var(--pf-danger);
      }
      .actions {
        display: flex;
        gap: 0.6rem;
        margin-top: 1.2rem;
      }
      .actions .spacer {
        flex: 1;
      }
      .err {
        color: var(--pf-danger);
        font-size: 0.82rem;
        margin-top: 0.6rem;
      }
    `,
  ];

  /** When set, the editor is in edit mode for this record. */
  @property({ attribute: false }) record: CycleWithCosts | null = null;
  /** Resolved crop name for the record (edit mode). */
  @property({ type: String }) cropName = "";
  /** Monthly overhead pool, allocated into this cycle's break-even. */
  @property({ type: Number }) monthlyOverhead = 0;

  @state() private fCropName = "";
  @state() private fLabel = "";
  @state() private fPlot = "";
  @state() private fScaleCount = "500";
  @state() private fScaleUnit = "polybag";
  @state() private fPlant = "";
  /** Days from planting to estimated harvest. harvestDate is derived from this. */
  @state() private fDays = "";
  @state() private fYieldWorst = "";
  @state() private fYieldExpected = "";
  @state() private fYieldBest = "";
  @state() private fPrice = "";
  @state() private fStatus: CropCycle["status"] = "planned";
  @state() private rows: CostRow[] = [];
  @state() private error = "";

  override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("record")) {
      this.hydrate();
    } else if (changed.has("cropName") && this.record) {
      // On a cold deep-link, the crops list can load after the editor first
      // renders, so the cropName prop arrives later. Re-sync the field then.
      this.fCropName = this.cropName;
    }
  }

  private hydrate(): void {
    const r = this.record;
    if (!r) {
      // new cycle defaults
      this.fCropName = "";
      this.fLabel = "";
      this.fPlot = "";
      this.fScaleCount = "500";
      this.fScaleUnit = "polybag";
      this.fPlant = todayISO();
      this.fDays = "";
      this.fYieldWorst = "";
      this.fYieldExpected = "";
      this.fYieldBest = "";
      this.fPrice = "";
      this.fStatus = "planned";
      this.rows = [blankRow()];
      this.error = "";
      return;
    }
    const { cycle, costs } = r;
    this.fCropName = this.cropName;
    this.fLabel = cycle.label;
    this.fPlot = cycle.plotName ?? "";
    this.fScaleCount = String(cycle.scaleCount ?? 0);
    this.fScaleUnit = cycle.scaleUnit ?? "polybag";
    this.fPlant = cycle.plantDate;
    const days = daysBetween(cycle.plantDate, cycle.harvestDate);
    this.fDays = days == null ? "" : String(days);
    this.fYieldWorst = String(cycle.yield.worstKg);
    this.fYieldExpected = String(cycle.yield.expectedKg);
    this.fYieldBest = String(cycle.yield.bestKg);
    this.fPrice = String(cycle.expectedPricePerKg);
    this.fStatus = cycle.status;
    this.rows = costs.length
      ? costs.map((c) => ({
          clientId: rowSeq++,
          label: c.label,
          category: c.category,
          basis: c.basis,
          amount: String(c.amount),
        }))
      : [blankRow()];
    this.error = "";
  }

  // ---- live assumptions for the calc panel ----

  private get costItems(): CostItem[] {
    return this.rows.map((r) => ({
      id: 0,
      cycleId: 0,
      label: r.label,
      category: r.category,
      basis: r.basis,
      amount: num(r.amount),
      createdAt: "",
    }));
  }

  /** Estimated harvest date, derived from plant date + days to harvest. */
  private get harvestDate(): string {
    return addDays(this.fPlant, num(this.fDays));
  }

  private get liveCycle(): CropCycle {
    return {
      id: 0,
      cropId: 0,
      label: this.fLabel,
      plotName: this.fPlot,
      scaleCount: num(this.fScaleCount),
      scaleUnit: this.fScaleUnit,
      plantDate: this.fPlant,
      harvestDate: this.harvestDate,
      yield: {
        worstKg: num(this.fYieldWorst),
        expectedKg: num(this.fYieldExpected),
        bestKg: num(this.fYieldBest),
      },
      expectedPricePerKg: num(this.fPrice),
      status: this.fStatus,
      createdAt: "",
    };
  }

  override render() {
    const cyc = this.liveCycle;
    const costs = withOverhead(cyc, this.costItems, this.monthlyOverhead);
    const overhead = allocatedOverhead(cyc, this.monthlyOverhead);
    const committed = committedCost(cyc, costs);
    const perUnit = perUnitCost(costs);
    const varKg = variableCostPerKg(costs);
    const bep = breakEvenPricePerKg(cyc, costs);
    const beYield = breakEvenYieldKg(cyc, costs);
    const profit = profitAtExpectedPrice(cyc, costs);
    const price = cyc.expectedPricePerKg;
    const hasYield = cyc.yield.expectedKg > 0;
    const profitable = hasYield && profit.expected >= 0;

    return html`
      <div class="card form">
        <h3>${this.record ? "Edit crop cycle" : "New crop cycle"}</h3>
        <p class="sub">Enter your plan; the numbers on the right update live.</p>

        <div class="row">
          <div class="field">
            <label>Crop</label>
            <input
              .value=${this.fCropName}
              placeholder="Shallot"
              @input=${(e: Event) => (this.fCropName = val(e))}
            />
          </div>
          <div class="field">
            <label>Label</label>
            <input
              .value=${this.fLabel}
              placeholder="Rainy season — plot A"
              @input=${(e: Event) => (this.fLabel = val(e))}
            />
          </div>
        </div>

        <div class="row">
          <div class="field">
            <label>Plot name</label>
            <input .value=${this.fPlot} @input=${(e: Event) => (this.fPlot = val(e))} />
          </div>
          <div class="field">
            <label>How many</label>
            <input
              type="number"
              step="1"
              .value=${this.fScaleCount}
              @input=${(e: Event) => (this.fScaleCount = val(e))}
            />
          </div>
          <div class="field">
            <label>Unit</label>
            <select @change=${(e: Event) => (this.fScaleUnit = val(e))}>
              ${SCALE_UNITS.map(
                (u) => html`<option value=${u} ?selected=${this.fScaleUnit === u}>${u}</option>`,
              )}
            </select>
          </div>
          <div class="field">
            <label>Status</label>
            <select @change=${(e: Event) => (this.fStatus = val(e) as CropCycle["status"])}>
              <option value="planned" ?selected=${this.fStatus === "planned"}>Planned</option>
              <option value="growing" ?selected=${this.fStatus === "growing"}>Growing</option>
              <option value="harvested" ?selected=${this.fStatus === "harvested"}>
                Harvested
              </option>
            </select>
          </div>
        </div>

        <div class="row">
          <div class="field">
            <label>Plant date</label>
            <input
              type="date"
              .value=${this.fPlant}
              @input=${(e: Event) => (this.fPlant = val(e))}
            />
          </div>
          <div class="field">
            <label>Days to harvest</label>
            <input
              type="number"
              step="1"
              min="1"
              .value=${this.fDays}
              placeholder="100"
              @input=${(e: Event) => (this.fDays = val(e))}
            />
            ${this.fDays && this.fPlant
              ? html`<small class="sub" style="margin:0.3rem 0 0"
                  >Est. harvest ${formatDate(this.harvestDate)}</small
                >`
              : ""}
          </div>
        </div>

        <div class="row">
          <div class="field">
            <label>Yield — worst (kg)</label>
            <input
              type="number"
              .value=${this.fYieldWorst}
              @input=${(e: Event) => (this.fYieldWorst = val(e))}
            />
          </div>
          <div class="field">
            <label>Expected (kg)</label>
            <input
              type="number"
              .value=${this.fYieldExpected}
              @input=${(e: Event) => (this.fYieldExpected = val(e))}
            />
          </div>
          <div class="field">
            <label>Best (kg)</label>
            <input
              type="number"
              .value=${this.fYieldBest}
              @input=${(e: Event) => (this.fYieldBest = val(e))}
            />
          </div>
        </div>

        <div class="field">
          <label>Expected market price (Rp/kg)</label>
          <input
            type="number"
            .value=${this.fPrice}
            placeholder="30000"
            @input=${(e: Event) => (this.fPrice = val(e))}
          />
        </div>

        <h3 style="margin-top:1.4rem">Costs</h3>
        <div class="costs-head">
          <label>Item</label>
          <label>Category</label>
          <label>Basis · amount</label>
          <span></span>
        </div>
        ${this.rows.map((r) => this.renderCostRow(r))}
        <button class="ghost add-cost" @click=${this.addRow}>+ Add cost</button>

        ${this.error ? html`<p class="err">${this.error}</p>` : ""}

        <div class="actions">
          <button class="ghost" @click=${this.cancel}>Cancel</button>
          <span class="spacer"></span>
          ${this.record
            ? html`<button class="danger" @click=${this.removeCycle}>Delete</button>`
            : ""}
          <button class="primary" @click=${this.save}>Save cycle</button>
        </div>
      </div>

      <div class="card panel">
        <h3>Break-even &amp; profit</h3>
        <div class="metric">
          <span class="k"
            >Committed cost<br /><small
              >${num(this.fScaleCount)} ${this.fScaleUnit}${perUnit
                ? ` · ${formatRupiah(perUnit)}/${unitShort(this.fScaleUnit)}`
                : ""}</small
            ></span
          >
          <span class="v">${formatRupiah(committed)}</span>
        </div>
        <div class="metric">
          <span class="k">Variable cost</span>
          <span class="v">${varKg ? `${formatRupiah(varKg)}/kg` : "–"}</span>
        </div>
        ${overhead > 0
          ? html`<div class="metric">
              <span class="k"
                >Overhead share<br /><small>${durationMonths(cyc)} mo (in committed)</small></span
              >
              <span class="v">${formatRupiah(overhead)}</span>
            </div>`
          : ""}
        <div class="metric">
          <span class="k">Break-even price<br /><small>worst · exp · best yield</small></span>
          <span class="v band">
            <span>${fmtBand(bep.worst)}</span>·<b>${fmtBand(bep.expected)}</b>·<span
              >${fmtBand(bep.best)}</span
            >
          </span>
        </div>
        <div class="metric">
          <span class="k">Break-even yield<br /><small>at Rp ${this.fPrice || "0"}/kg</small></span>
          <span class="v">${beYield == null ? "never" : formatKg(beYield)}</span>
        </div>
        <div class="metric">
          <span class="k">Profit @ expected price<br /><small>worst · exp · best</small></span>
          <span class="v band">
            <span class=${cls(profit.worst)}>${formatRupiah(profit.worst)}</span>·<b
              class=${cls(profit.expected)}
              >${formatRupiah(profit.expected)}</b
            >·<span class=${cls(profit.best)}>${formatRupiah(profit.best)}</span>
          </span>
        </div>

        ${hasYield
          ? html`<div class="verdict ${profitable ? "ok" : "loss"}">
              ${profitable
                ? `Profitable — ${formatRupiah(profit.expected)} at expected yield`
                : `Loses money at expected yield`}
              <small>
                Market is ${formatRupiah(price)}/kg; you need at least
                ${fmtBand(bep.expected)}/kg to break even on a normal harvest.
                ${profit.worst < 0
                  ? ` A poor harvest loses ${formatRupiah(-profit.worst)}.`
                  : ` Even a poor harvest stays positive.`}
              </small>
            </div>`
          : html`<div class="verdict loss">
              Enter an expected yield to see the result.
            </div>`}
      </div>
    `;
  }

  private renderCostRow(r: CostRow) {
    return html`
      <div class="cost-row">
        <input
          .value=${r.label}
          placeholder="Seeds"
          @input=${(e: Event) => this.patchRow(r.clientId, { label: val(e) })}
        />
        <select @change=${(e: Event) => this.patchRow(r.clientId, { category: val(e) as CostCategory })}>
          ${CATEGORIES.map(
            (c) => html`<option value=${c} ?selected=${r.category === c}>${c}</option>`,
          )}
        </select>
        <div class="row" style="gap:0.35rem">
          <select
            style="flex:0 0 5.4rem"
            @change=${(e: Event) => this.patchRow(r.clientId, { basis: val(e) as Basis })}
          >
            <option value="perCycle" ?selected=${r.basis === "perCycle"}>/cycle</option>
            <option value="perUnit" ?selected=${r.basis === "perUnit"}>
              /${unitShort(this.fScaleUnit)}
            </option>
            <option value="perKg" ?selected=${r.basis === "perKg"}>/kg</option>
          </select>
          <input
            type="number"
            .value=${r.amount}
            placeholder="0"
            @input=${(e: Event) => this.patchRow(r.clientId, { amount: val(e) })}
          />
        </div>
        <button class="ghost del" title="Remove" @click=${() => this.removeRow(r.clientId)}>
          ✕
        </button>
      </div>
    `;
  }

  private addRow = () => {
    this.rows = [...this.rows, blankRow()];
  };

  private removeRow(clientId: number): void {
    this.rows = this.rows.filter((r) => r.clientId !== clientId);
  }

  private patchRow(clientId: number, patch: Partial<CostRow>): void {
    this.rows = this.rows.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r));
  }

  private cancel = () => {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  };

  private removeCycle = async () => {
    const id = this.record?.cycle.id;
    if (id == null) return;
    this.dispatchEvent(
      new CustomEvent("delete", { detail: id, bubbles: true, composed: true }),
    );
  };

  private save = async () => {
    this.error = "";
    if (!this.fCropName.trim()) return (this.error = "Crop name is required."), undefined;
    if (!this.fLabel.trim()) return (this.error = "Label is required."), undefined;
    if (!this.fPlant) return (this.error = "Plant date is required."), undefined;
    if (num(this.fDays) <= 0)
      return (this.error = "Days to harvest must be greater than zero."), undefined;
    if (num(this.fYieldExpected) <= 0)
      return (this.error = "Expected yield must be greater than zero."), undefined;

    const cropId = await findOrCreateCrop(this.fCropName);
    const costInputs: CostInput[] = this.rows
      .filter((r) => r.label.trim() || num(r.amount) > 0)
      .map((r) => ({
        label: r.label.trim() || "(unnamed)",
        category: r.category,
        basis: r.basis,
        amount: num(r.amount),
      }));

    await saveCycleWithCosts(
      {
        cropId,
        label: this.fLabel.trim(),
        plotName: this.fPlot.trim() || undefined,
        scaleCount: num(this.fScaleCount),
        scaleUnit: this.fScaleUnit,
        plantDate: this.fPlant,
        harvestDate: this.harvestDate,
        yield: {
          worstKg: num(this.fYieldWorst),
          expectedKg: num(this.fYieldExpected),
          bestKg: num(this.fYieldBest),
        },
        expectedPricePerKg: num(this.fPrice),
        status: this.fStatus,
      },
      costInputs,
      this.record?.cycle.id,
    );

    this.dispatchEvent(new CustomEvent("saved", { bubbles: true, composed: true }));
  };
}

// ---- small helpers ----

function blankRow(): CostRow {
  return { clientId: rowSeq++, label: "", category: "seed", basis: "perCycle", amount: "" };
}

function num(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function val(e: Event): string {
  return (e.target as HTMLInputElement | HTMLSelectElement).value;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Add `days` to an ISO date string, returning a new ISO date ("" if invalid). */
function addDays(iso: string, days: number): string {
  if (!iso || !Number.isFinite(days)) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; null if either date is missing/invalid. */
function daysBetween(from: string, to: string): number | null {
  if (!from || !to) return null;
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Format an ISO date for display, e.g. "12 Aug 2026". */
function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtBand(n: number): string {
  return Number.isFinite(n) ? formatRupiah(n) : "–";
}

function cls(n: number): string {
  return n >= 0 ? "pos" : "neg";
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-cycle-editor": CycleEditor;
  }
}
