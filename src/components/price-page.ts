import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { controls } from "../styles/shared";
import {
  listCrops,
  listAllPrices,
  addPriceObservation,
  deletePriceObservation,
  findOrCreateCrop,
} from "../db/db";
import type { Crop, PriceObservation } from "../domain/types";
import { monthlyPriceCurve } from "../domain/calc";
import { formatRupiah } from "../domain/format";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

@customElement("pf-price-page")
export class PricePage extends LitElement {
  static override styles = [
    controls,
    css`
      :host {
        display: block;
        max-width: 760px;
        margin: 0 auto;
      }
      .topbar {
        display: flex;
        align-items: center;
        margin-bottom: 1rem;
      }
      .topbar h2 {
        margin: 0;
        font-size: 1.15rem;
      }
      .spacer {
        flex: 1;
      }
      .card {
        background: var(--pf-surface);
        border: 1px solid var(--pf-border);
        border-radius: var(--pf-radius);
        padding: 1.2rem;
        margin-bottom: 1rem;
        box-shadow: 0 1px 2px var(--pf-shadow);
      }
      h3 {
        margin: 0 0 0.9rem;
        font-size: 1.05rem;
      }
      .add-row {
        display: grid;
        grid-template-columns: 1.3fr 1fr 1fr auto;
        gap: 0.6rem;
        align-items: end;
      }
      .add-row2 {
        display: grid;
        grid-template-columns: 1fr 1.6fr;
        gap: 0.6rem;
        margin-top: 0.6rem;
      }
      .field {
        margin: 0;
      }
      .chart-head {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        margin-bottom: 0.8rem;
      }
      .chart-head h3 {
        margin: 0;
      }
      .chart-head select {
        width: auto;
        min-width: 140px;
      }
      .chart {
        display: grid;
        grid-template-columns: repeat(12, 1fr);
        gap: 0.3rem;
        align-items: end;
        height: 160px;
      }
      .col {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        height: 100%;
        gap: 0.25rem;
      }
      .bar {
        width: 70%;
        min-height: 2px;
        background: var(--pf-primary);
        border-radius: 3px 3px 0 0;
        transition: height 0.2s ease;
      }
      .bar.empty {
        background: var(--pf-surface-2);
      }
      .bval {
        font-size: 0.62rem;
        color: var(--pf-text-muted);
        white-space: nowrap;
      }
      .mlabels {
        display: grid;
        grid-template-columns: repeat(12, 1fr);
        gap: 0.3rem;
        margin-top: 0.3rem;
      }
      .mlabels span {
        text-align: center;
        font-size: 0.62rem;
        color: var(--pf-text-muted);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.88rem;
      }
      th {
        text-align: left;
        font-weight: 600;
        color: var(--pf-text-muted);
        font-size: 0.78rem;
        padding: 0.3rem 0.5rem;
        border-bottom: 1px solid var(--pf-border);
      }
      td {
        padding: 0.45rem 0.5rem;
        border-bottom: 1px solid var(--pf-border);
      }
      td.num {
        text-align: right;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      tr:last-child td {
        border-bottom: none;
      }
      .del {
        padding: 0.25rem 0.5rem;
        font-size: 0.8rem;
      }
      .empty {
        color: var(--pf-text-muted);
        text-align: center;
        padding: 1.5rem;
      }
      .err {
        color: var(--pf-danger);
        font-size: 0.82rem;
        margin-top: 0.6rem;
      }
    `,
  ];

  @state() private crops: Crop[] = [];
  @state() private prices: PriceObservation[] = [];

  @state() private fCrop = "";
  @state() private fDate = todayISO();
  @state() private fPrice = "";
  @state() private fLocation = "";
  @state() private fNote = "";
  @state() private error = "";

  @state() private chartCropId: number | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    const [crops, prices] = await Promise.all([listCrops(), listAllPrices()]);
    this.crops = crops;
    this.prices = prices;
    if (this.chartCropId == null || !crops.some((c) => c.id === this.chartCropId)) {
      // default chart to the crop of the most recent observation, if any
      this.chartCropId = prices[0]?.cropId ?? crops[0]?.id ?? null;
    }
  }

  private cropName(id: number): string {
    return this.crops.find((c) => c.id === id)?.name ?? "—";
  }

  private async addObservation(): Promise<void> {
    this.error = "";
    const price = Number(this.fPrice);
    if (!this.fCrop.trim()) return void (this.error = "Crop is required.");
    if (!this.fDate) return void (this.error = "Date is required.");
    if (!Number.isFinite(price) || price <= 0)
      return void (this.error = "Enter a price greater than zero.");

    const cropId = await findOrCreateCrop(this.fCrop);
    await addPriceObservation({
      cropId,
      date: this.fDate,
      pricePerKg: Math.round(price),
      location: this.fLocation.trim() || undefined,
      note: this.fNote.trim() || undefined,
    });
    this.chartCropId = cropId;
    // keep crop + date for fast repeated entry; clear the rest
    this.fPrice = "";
    this.fLocation = "";
    this.fNote = "";
    await this.load();
  }

  private async removeObservation(id: number): Promise<void> {
    await deletePriceObservation(id);
    await this.load();
  }

  override render() {
    const cropNames = [...new Set(this.crops.map((c) => c.name))];
    const cropsWithData = this.crops.filter((c) =>
      this.prices.some((p) => p.cropId === c.id),
    );

    return html`
      <div class="topbar">
        <h2>Market prices</h2>
      </div>

      <div class="card">
        <h3>Log a price</h3>
        <div class="add-row">
          <div class="field">
            <label>Crop</label>
            <input
              list="pf-crop-names"
              placeholder="Chili"
              .value=${this.fCrop}
              @input=${(e: Event) => (this.fCrop = val(e))}
            />
            <datalist id="pf-crop-names">
              ${cropNames.map((n) => html`<option value=${n}></option>`)}
            </datalist>
          </div>
          <div class="field">
            <label>Date</label>
            <input type="date" .value=${this.fDate} @input=${(e: Event) => (this.fDate = val(e))} />
          </div>
          <div class="field">
            <label>Price (Rp/kg)</label>
            <input
              type="number"
              placeholder="30000"
              .value=${this.fPrice}
              @input=${(e: Event) => (this.fPrice = val(e))}
              @keydown=${(e: KeyboardEvent) => e.key === "Enter" && this.addObservation()}
            />
          </div>
          <button class="primary" @click=${this.addObservation}>Add</button>
        </div>
        <div class="add-row2">
          <div class="field">
            <label>Location (optional)</label>
            <input .value=${this.fLocation} @input=${(e: Event) => (this.fLocation = val(e))} />
          </div>
          <div class="field">
            <label>Note (optional)</label>
            <input .value=${this.fNote} @input=${(e: Event) => (this.fNote = val(e))} />
          </div>
        </div>
        ${this.error ? html`<p class="err">${this.error}</p>` : ""}
      </div>

      ${cropsWithData.length > 0 ? this.renderChart(cropsWithData) : ""}
      ${this.renderList()}
    `;
  }

  private renderChart(cropsWithData: Crop[]) {
    const curve = monthlyPriceCurve(
      this.prices.filter((p) => p.cropId === this.chartCropId),
    );
    const max = Math.max(1, ...curve.filter((v): v is number => v != null));
    return html`
      <div class="card">
        <div class="chart-head">
          <h3>Seasonal curve</h3>
          <select @change=${(e: Event) => (this.chartCropId = Number(val(e)))}>
            ${cropsWithData.map(
              (c) =>
                html`<option value=${c.id} ?selected=${c.id === this.chartCropId}>
                  ${c.name}
                </option>`,
            )}
          </select>
          <span class="spacer"></span>
        </div>
        <div class="chart">
          ${curve.map(
            (v) => html`<div class="col">
              <span class="bval">${v == null ? "" : compact(v)}</span>
              <div
                class="bar ${v == null ? "empty" : ""}"
                style="height:${v == null ? 2 : Math.max(2, (v / max) * 100)}%"
                title=${v == null ? "no data" : formatRupiah(v) + "/kg"}
              ></div>
            </div>`,
          )}
        </div>
        <div class="mlabels">${MONTHS.map((m) => html`<span>${m}</span>`)}</div>
      </div>
    `;
  }

  private renderList() {
    return html`
      <div class="card">
        <h3>Logged prices</h3>
        ${this.prices.length === 0
          ? html`<div class="empty">No prices logged yet. Add one above after a market visit.</div>`
          : html`<table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Crop</th>
                  <th class="num">Price/kg</th>
                  <th>Where / note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${this.prices.map(
                  (p) => html`<tr>
                    <td>${p.date}</td>
                    <td>${this.cropName(p.cropId)}</td>
                    <td class="num">${formatRupiah(p.pricePerKg)}</td>
                    <td>${[p.location, p.note].filter(Boolean).join(" · ")}</td>
                    <td class="num">
                      <button class="ghost del" @click=${() => this.removeObservation(p.id!)}>
                        ✕
                      </button>
                    </td>
                  </tr>`,
                )}
              </tbody>
            </table>`}
      </div>
    `;
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function val(e: Event): string {
  return (e.target as HTMLInputElement | HTMLSelectElement).value;
}

/** Compact rupiah for chart labels: 30000 -> "30k", 1500000 -> "1.5jt". */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}jt`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-price-page": PricePage;
  }
}
