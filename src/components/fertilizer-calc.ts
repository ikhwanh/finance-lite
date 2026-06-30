import { LitElement, html, css } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { controls } from "../styles/shared";
import { formatRupiah } from "../domain/format";

/** Result emitted when the user accepts the calculation. amount is per unit. */
export interface FertilizerCalcResult {
  label: string;
  /** Cost per scale unit (e.g. per bag) over the whole cycle, in Rupiah. */
  amount: number;
}

/**
 * Helper dialog that turns a dosing habit — "6 gr mixed in 10 L waters 10 bags,
 * applied 30 times" — into a per-unit fertilizer cost the editor can drop into a
 * cost row. Water volume is captured only as a note; it doesn't affect cost.
 */
@customElement("pf-fertilizer-calc")
export class FertilizerCalc extends LitElement {
  static override styles = [
    controls,
    css`
      dialog {
        width: min(440px, 92vw);
        border: 1px solid var(--pf-border);
        border-radius: var(--pf-radius);
        background: var(--pf-surface);
        color: var(--pf-text);
        padding: 1.2rem;
        box-shadow: 0 12px 40px var(--pf-shadow);
      }
      dialog::backdrop {
        background: rgba(0, 0, 0, 0.45);
      }
      h3 {
        margin: 0 0 0.3rem;
        font-size: 1.05rem;
      }
      .sub {
        font-size: 0.8rem;
        color: var(--pf-text-muted);
        margin: 0 0 1rem;
      }
      .pair {
        display: flex;
        gap: 0.6rem;
        align-items: end;
        margin-bottom: 0.9rem;
      }
      .pair > * {
        flex: 1;
      }
      .result {
        margin-top: 1rem;
        padding: 0.8rem 1rem;
        border-radius: var(--pf-radius-sm);
        background: var(--pf-surface-2);
      }
      .result .big {
        font-size: 1.2rem;
        font-weight: 700;
      }
      .result small {
        display: block;
        margin-top: 0.25rem;
        font-size: 0.8rem;
        color: var(--pf-text-muted);
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.6rem;
        margin-top: 1.2rem;
      }
    `,
  ];

  /** Short name of the cycle's scale unit, e.g. "bag", for labels. */
  @property({ type: String }) unitShort = "bag";

  @query("dialog") private dialog!: HTMLDialogElement;

  @state() private fLabel = "Fertilizer";
  @state() private fPackPrice = "";
  @state() private fPackGrams = "";
  @state() private fDoseGrams = "";
  @state() private fWaterLiters = "";
  @state() private fUnitsPerMix = "";
  @state() private fApplications = "";

  /** Open the modal, resetting to defaults. */
  open(): void {
    this.fLabel = "Fertilizer";
    this.fPackPrice = "";
    this.fPackGrams = "";
    this.fDoseGrams = "";
    this.fWaterLiters = "";
    this.fUnitsPerMix = "";
    this.fApplications = "";
    this.dialog.showModal();
  }

  private get pricePerGram(): number {
    const grams = num(this.fPackGrams);
    return grams > 0 ? num(this.fPackPrice) / grams : 0;
  }

  /** Fertilizer grams attributed to one unit per application. */
  private get dosePerUnit(): number {
    const units = num(this.fUnitsPerMix);
    return units > 0 ? num(this.fDoseGrams) / units : 0;
  }

  /** Per-unit cost over the whole cycle, in Rupiah. */
  private get perUnitCost(): number {
    return this.dosePerUnit * this.pricePerGram * num(this.fApplications);
  }

  override render() {
    const u = this.unitShort;
    const cost = this.perUnitCost;
    const ready = cost > 0;
    return html`
      <dialog @close=${this.onDialogClose}>
        <h3>Fertilizer cost calculator</h3>
        <p class="sub">
          Turn your dosing recipe into a cost per ${u}. Water volume is just a note.
        </p>

        <div class="field">
          <label>Label</label>
          <input
            .value=${this.fLabel}
            placeholder="Fertilizer"
            @input=${(e: Event) => (this.fLabel = val(e))}
          />
        </div>

        <div class="pair">
          <div class="field" style="margin:0">
            <label>Pack price (Rp)</label>
            <input
              type="number"
              .value=${this.fPackPrice}
              placeholder="25000"
              @input=${(e: Event) => (this.fPackPrice = val(e))}
            />
          </div>
          <div class="field" style="margin:0">
            <label>Pack size (gr)</label>
            <input
              type="number"
              .value=${this.fPackGrams}
              placeholder="1000"
              @input=${(e: Event) => (this.fPackGrams = val(e))}
            />
          </div>
        </div>

        <div class="pair">
          <div class="field" style="margin:0">
            <label>Dose per mix (gr)</label>
            <input
              type="number"
              .value=${this.fDoseGrams}
              placeholder="6"
              @input=${(e: Event) => (this.fDoseGrams = val(e))}
            />
          </div>
          <div class="field" style="margin:0">
            <label>Water per mix (L)</label>
            <input
              type="number"
              .value=${this.fWaterLiters}
              placeholder="10"
              @input=${(e: Event) => (this.fWaterLiters = val(e))}
            />
          </div>
        </div>

        <div class="pair">
          <div class="field" style="margin:0">
            <label>${u}s per mix</label>
            <input
              type="number"
              .value=${this.fUnitsPerMix}
              placeholder="10"
              @input=${(e: Event) => (this.fUnitsPerMix = val(e))}
            />
          </div>
          <div class="field" style="margin:0">
            <label>Applications / cycle</label>
            <input
              type="number"
              .value=${this.fApplications}
              placeholder="30"
              @input=${(e: Event) => (this.fApplications = val(e))}
            />
          </div>
        </div>

        <div class="result">
          <span class="big">${ready ? `${formatRupiah(round(cost))} /${u}` : "–"}</span>
          <small>
            ${ready
              ? `${trim(this.dosePerUnit)} gr/${u} × ${formatRupiah(round(this.pricePerGram))}/gr × ${num(
                  this.fApplications,
                )} applications`
              : "Fill in the numbers above to see the cost."}
          </small>
        </div>

        <div class="actions">
          <button class="ghost" @click=${this.cancel}>Cancel</button>
          <button class="primary" ?disabled=${!ready} @click=${this.accept}>
            Add as cost
          </button>
        </div>
      </dialog>
    `;
  }

  private cancel = () => this.dialog.close();

  private onDialogClose = () => {
    // native close (Esc / backdrop) — nothing to persist
  };

  private accept = () => {
    const cost = this.perUnitCost;
    if (cost <= 0) return;
    const water = num(this.fWaterLiters);
    const label = water > 0 ? `${this.fLabel.trim() || "Fertilizer"} (${trim(num(this.fDoseGrams))}gr/${trim(water)}L)` : this.fLabel.trim() || "Fertilizer";
    this.dispatchEvent(
      new CustomEvent<FertilizerCalcResult>("confirm", {
        detail: { label, amount: round(cost) },
        bubbles: true,
        composed: true,
      }),
    );
    this.dialog.close();
  };
}

function num(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function val(e: Event): string {
  return (e.target as HTMLInputElement).value;
}

/** Round to whole Rupiah. */
function round(n: number): number {
  return Math.round(n);
}

/** Trim a number to at most 2 decimals for display. */
function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-fertilizer-calc": FertilizerCalc;
  }
}
