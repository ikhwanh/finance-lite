import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { controls } from "../styles/shared";
import {
  listCyclesWithCosts,
  listCrops,
  deleteCycle,
  type CycleWithCosts,
} from "../db/db";
import type { Crop } from "../domain/types";
import { breakEvenPricePerKg, profitAtExpectedPrice } from "../domain/calc";
import { formatRupiah } from "../domain/format";
import "./cycle-editor";
import "./settings-page";
import "./price-page";
import "./scenario-page";

type Theme = "light" | "dark";
type View =
  | { mode: "list" }
  | { mode: "edit"; record: CycleWithCosts | null }
  | { mode: "prices" }
  | { mode: "scenarios" }
  | { mode: "settings" };

@customElement("pf-app")
export class AppRoot extends LitElement {
  static override styles = [
    controls,
    css`
      :host {
        display: block;
      }
      header {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 0.8rem 1.1rem;
        background: var(--pf-surface);
        border-bottom: 1px solid var(--pf-border);
        position: sticky;
        top: 0;
        z-index: 10;
      }
      .brand {
        font-weight: 700;
        font-size: 1.1rem;
      }
      .brand .ico {
        color: var(--pf-primary);
      }
      .spacer {
        flex: 1;
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
        padding: 1.2rem 1rem 3rem;
      }
      .toolbar {
        display: flex;
        align-items: center;
        margin-bottom: 1rem;
      }
      .toolbar h2 {
        margin: 0;
        font-size: 1.15rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 0.9rem;
      }
      .cyc {
        text-align: left;
        background: var(--pf-surface);
        border: 1px solid var(--pf-border);
        border-radius: var(--pf-radius);
        padding: 1rem 1.1rem;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .cyc:hover {
        border-color: var(--pf-primary);
      }
      .cyc .top {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 0.5rem;
      }
      .cyc .name {
        font-weight: 700;
      }
      .cyc .label {
        font-size: 0.82rem;
        color: var(--pf-text-muted);
      }
      .pill {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        background: var(--pf-surface-2);
        color: var(--pf-text-muted);
      }
      .nums {
        display: flex;
        justify-content: space-between;
        font-size: 0.85rem;
        margin-top: 0.3rem;
      }
      .nums .k {
        color: var(--pf-text-muted);
      }
      .pos {
        color: var(--pf-ok);
        font-weight: 700;
      }
      .neg {
        color: var(--pf-danger);
        font-weight: 700;
      }
      .empty {
        text-align: center;
        padding: 3rem 1rem;
        color: var(--pf-text-muted);
      }
    `,
  ];

  @state() private theme: Theme = currentTheme();
  @state() private view: View = { mode: "list" };
  @state() private cycles: CycleWithCosts[] = [];
  @state() private crops: Crop[] = [];

  override connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    const [cycles, crops] = await Promise.all([listCyclesWithCosts(), listCrops()]);
    this.cycles = cycles;
    this.crops = crops;
  }

  private cropName(cropId: number): string {
    return this.crops.find((c) => c.id === cropId)?.name ?? "Crop";
  }

  private toggleTheme(): void {
    this.theme = this.theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", this.theme);
    localStorage.setItem("pf-theme", this.theme);
  }

  private openNew(): void {
    this.view = { mode: "edit", record: null };
  }

  private openEdit(record: CycleWithCosts): void {
    this.view = { mode: "edit", record };
  }

  private async onSaved(): Promise<void> {
    await this.load();
    this.view = { mode: "list" };
  }

  private async onDelete(id: number): Promise<void> {
    await deleteCycle(id);
    await this.load();
    this.view = { mode: "list" };
  }

  private async onImported(): Promise<void> {
    await this.load();
  }

  override render() {
    return html`
      <header>
        <span class="brand"><span class="ico">🌾</span> Finance Lite</span>
        <span class="spacer"></span>
        <button
          class="ghost"
          @click=${() => (this.view = { mode: "scenarios" })}
          title="Compare what-ifs"
        >
          ⚖️
        </button>
        <button
          class="ghost"
          @click=${() => (this.view = { mode: "prices" })}
          title="Market prices"
        >
          📈
        </button>
        <button
          class="ghost"
          @click=${() => (this.view = { mode: "settings" })}
          title="Settings & sync"
        >
          ⚙️
        </button>
        <button class="ghost" @click=${this.toggleTheme} title="Toggle theme">
          ${this.theme === "light" ? "🌙" : "☀️"}
        </button>
      </header>
      <main>${this.renderView()}</main>
    `;
  }

  private renderView() {
    switch (this.view.mode) {
      case "edit":
        return this.renderEdit();
      case "prices":
        return html`<pf-price-page
          @close=${() => (this.view = { mode: "list" })}
        ></pf-price-page>`;
      case "scenarios":
        return html`<pf-scenario-page
          @close=${() => (this.view = { mode: "list" })}
        ></pf-scenario-page>`;
      case "settings":
        return html`<pf-settings-page
          @close=${() => (this.view = { mode: "list" })}
          @imported=${this.onImported}
        ></pf-settings-page>`;
      default:
        return this.renderList();
    }
  }

  private renderEdit() {
    const record = this.view.mode === "edit" ? this.view.record : null;
    return html`
      <pf-cycle-editor
        .record=${record}
        .cropName=${record ? this.cropName(record.cycle.cropId) : ""}
        @saved=${this.onSaved}
        @close=${() => (this.view = { mode: "list" })}
        @delete=${(e: CustomEvent<number>) => this.onDelete(e.detail)}
      ></pf-cycle-editor>
    `;
  }

  private renderList() {
    return html`
      <div class="toolbar">
        <h2>Crop cycles</h2>
        <span class="spacer"></span>
        <button class="primary" @click=${this.openNew}>+ New cycle</button>
      </div>
      ${this.cycles.length === 0
        ? html`<div class="empty">
            No cycles yet. Create one to see its break-even and profit.
          </div>`
        : html`<div class="grid">
            ${this.cycles.map((r) => this.renderCard(r))}
          </div>`}
    `;
  }

  private renderCard(r: CycleWithCosts) {
    const profit = profitAtExpectedPrice(r.cycle, r.costs);
    const bep = breakEvenPricePerKg(r.cycle, r.costs);
    return html`
      <button class="cyc" @click=${() => this.openEdit(r)}>
        <div class="top">
          <span class="name">${this.cropName(r.cycle.cropId)}</span>
          <span class="pill">${r.cycle.status}</span>
        </div>
        <span class="label">${r.cycle.label}</span>
        <div class="nums">
          <span class="k">Break-even price</span>
          <span>${formatRupiah(bep.expected)}/kg</span>
        </div>
        <div class="nums">
          <span class="k">Market price</span>
          <span>${formatRupiah(r.cycle.expectedPricePerKg)}/kg</span>
        </div>
        <div class="nums">
          <span class="k">Profit (expected)</span>
          <span class=${profit.expected >= 0 ? "pos" : "neg"}>
            ${formatRupiah(profit.expected)}
          </span>
        </div>
      </button>
    `;
  }
}

function currentTheme(): Theme {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "dark" ? "dark" : "light";
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-app": AppRoot;
  }
}
