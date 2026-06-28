import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { controls } from "../styles/shared";
import {
  listCyclesWithCosts,
  listCrops,
  deleteCycle,
  getMonthlyOverhead,
  type CycleWithCosts,
} from "../db/db";
import type { Crop } from "../domain/types";
import { breakEvenPricePerKg, profitAtExpectedPrice, withOverhead } from "../domain/calc";
import { formatRupiah } from "../domain/format";
import "./cycle-editor";
import "./settings-page";
import "./price-page";
import "./scenario-page";
import "./overhead-page";

type View =
  | { mode: "list" }
  | { mode: "edit"; record: CycleWithCosts | null }
  | { mode: "prices" }
  | { mode: "scenarios" }
  | { mode: "overhead" }
  | { mode: "settings" };

type ViewMode = View["mode"];

// Maps URL hash slugs to view modes. "edit" intentionally has no slug — it is a
// sub-state of the crop cycles list and falls back to "crop_cycles".
const HASH_TO_MODE: Record<string, ViewMode> = {
  crop_cycles: "list",
  scenarios: "scenarios",
  market_prices: "prices",
  overhead: "overhead",
  settings: "settings",
};

const MODE_TO_HASH: Partial<Record<ViewMode, string>> = {
  list: "crop_cycles",
  edit: "crop_cycles",
  scenarios: "scenarios",
  prices: "market_prices",
  overhead: "overhead",
  settings: "settings",
};

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
        gap: 0.4rem;
        padding: 0 0.6rem;
        background: color-mix(in srgb, var(--pf-surface) 80%, transparent);
        backdrop-filter: saturate(1.2) blur(8px);
        border-bottom: 1px solid var(--pf-border);
        position: sticky;
        top: 0;
        z-index: 10;
      }
      nav {
        display: flex;
        align-items: stretch;
        gap: 0.1rem;
        flex: 1;
        overflow-x: auto;
        scrollbar-width: none;
      }
      nav::-webkit-scrollbar {
        display: none;
      }
      .tab {
        appearance: none;
        border: none;
        background: transparent;
        color: var(--pf-text-muted);
        font: inherit;
        font-weight: 500;
        font-size: 0.92rem;
        white-space: nowrap;
        padding: 0.95rem 0.85rem;
        border-bottom: 2px solid transparent;
        border-radius: 0;
        cursor: pointer;
        transition: color 0.15s ease, border-color 0.15s ease;
      }
      .tab:hover {
        color: var(--pf-text);
        background: transparent;
        border-color: transparent;
      }
      .tab.active {
        color: var(--pf-primary);
        border-bottom-color: var(--pf-primary);
      }
      .icon-btn {
        flex: 0 0 auto;
        width: 2.2rem;
        height: 2.2rem;
        display: grid;
        place-items: center;
        padding: 0;
        font-size: 1.05rem;
        border-radius: 999px;
      }
      .spacer {
        flex: 1;
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
        padding: 1.4rem 1rem 3rem;
      }
      .toolbar {
        display: flex;
        align-items: center;
        margin-bottom: 1.1rem;
      }
      .toolbar h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 0.8rem;
      }
      .cyc {
        text-align: left;
        background: var(--pf-surface);
        border: 1px solid var(--pf-border);
        border-radius: var(--pf-radius);
        padding: 1rem 1.05rem;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        box-shadow: 0 1px 2px var(--pf-shadow);
        transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
      }
      .cyc:hover {
        border-color: var(--pf-primary);
        box-shadow: 0 6px 16px var(--pf-shadow);
        transform: translateY(-2px);
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
        font-variant-numeric: tabular-nums;
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
      footer {
        max-width: 1100px;
        margin: 0 auto;
        padding: 1.4rem 1rem 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        font-size: 0.8rem;
        color: var(--pf-text-muted);
      }
      footer a {
        color: var(--pf-text-muted);
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
      }
      footer a:hover {
        color: var(--pf-primary);
      }
      footer svg {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
      }
      footer .sep {
        opacity: 0.5;
      }
    `,
  ];

  @state() private view: View = { mode: "list" };
  @state() private cycles: CycleWithCosts[] = [];
  @state() private crops: Crop[] = [];
  @state() private monthlyOverhead = 0;

  private readonly onHashChange = (): void => {
    this.applyHash();
  };

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("hashchange", this.onHashChange);
    this.applyHash();
    void this.load();
  }

  override disconnectedCallback(): void {
    window.removeEventListener("hashchange", this.onHashChange);
    super.disconnectedCallback();
  }

  // Reads the current URL hash and switches to the matching view. Unknown or
  // empty hashes fall back to the crop cycles list.
  private applyHash(): void {
    const slug = window.location.hash.replace(/^#/, "");
    const mode = HASH_TO_MODE[slug] ?? "list";
    if (mode !== this.view.mode) {
      this.view = { mode } as View;
    }
  }

  // Navigates to a view and reflects it in the URL hash. Updating the hash
  // triggers onHashChange, which applies the view, so we only set it here.
  private goto(view: View): void {
    const slug = MODE_TO_HASH[view.mode] ?? "crop_cycles";
    if (window.location.hash.replace(/^#/, "") === slug) {
      // Hash already correct (e.g. list -> edit); apply the view directly.
      this.view = view;
    } else {
      this.view = view;
      window.location.hash = slug;
    }
  }

  private async load(): Promise<void> {
    const [cycles, crops, monthlyOverhead] = await Promise.all([
      listCyclesWithCosts(),
      listCrops(),
      getMonthlyOverhead(),
    ]);
    this.cycles = cycles;
    this.crops = crops;
    this.monthlyOverhead = monthlyOverhead;
  }

  private cropName(cropId: number): string {
    return this.crops.find((c) => c.id === cropId)?.name ?? "Crop";
  }

  private openNew(): void {
    this.goto({ mode: "edit", record: null });
  }

  private openEdit(record: CycleWithCosts): void {
    this.goto({ mode: "edit", record });
  }

  private async onSaved(): Promise<void> {
    await this.load();
    this.goto({ mode: "list" });
  }

  private async onDelete(id: number): Promise<void> {
    await deleteCycle(id);
    await this.load();
    this.goto({ mode: "list" });
  }

  private async onImported(): Promise<void> {
    await this.load();
  }

  override render() {
    const m = this.view.mode;
    const cyclesActive = m === "list" || m === "edit";
    return html`
      <header>
        <nav>
          <button
            class="tab ${cyclesActive ? "active" : ""}"
            @click=${() => this.goto({ mode: "list" })}
          >
            Crop cycles
          </button>
          <button
            class="tab ${m === "scenarios" ? "active" : ""}"
            @click=${() => this.goto({ mode: "scenarios" })}
          >
            Compare what-ifs
          </button>
          <button
            class="tab ${m === "prices" ? "active" : ""}"
            @click=${() => this.goto({ mode: "prices" })}
          >
            Market prices
          </button>
          <button
            class="tab ${m === "overhead" ? "active" : ""}"
            @click=${() => this.goto({ mode: "overhead" })}
          >
            Overhead
          </button>
        </nav>
        <button
          class="ghost icon-btn ${m === "settings" ? "active" : ""}"
          @click=${() => this.goto({ mode: "settings" })}
          title="Settings"
          aria-label="Settings"
        >
          ⚙️
        </button>
      </header>
      <main>${this.renderView()}</main>
      <footer>
        <a
          href="https://github.com/ikhwanh/finance-lite"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          GitHub
        </a>
        <span class="sep">·</span>
        <span>v${__APP_VERSION__}</span>
      </footer>
    `;
  }

  private renderView() {
    switch (this.view.mode) {
      case "edit":
        return this.renderEdit();
      case "prices":
        return html`<pf-price-page
          @close=${() => this.goto({ mode: "list" })}
        ></pf-price-page>`;
      case "scenarios":
        return html`<pf-scenario-page
          @close=${() => this.goto({ mode: "list" })}
        ></pf-scenario-page>`;
      case "overhead":
        return html`<pf-overhead-page
          @close=${() => this.goto({ mode: "list" })}
          @changed=${this.onImported}
        ></pf-overhead-page>`;
      case "settings":
        return html`<pf-settings-page
          @close=${() => this.goto({ mode: "list" })}
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
        .monthlyOverhead=${this.monthlyOverhead}
        @saved=${this.onSaved}
        @close=${() => this.goto({ mode: "list" })}
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
    const costs = withOverhead(r.cycle, r.costs, this.monthlyOverhead);
    const profit = profitAtExpectedPrice(r.cycle, costs);
    const bep = breakEvenPricePerKg(r.cycle, costs);
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

declare global {
  interface HTMLElementTagNameMap {
    "pf-app": AppRoot;
  }
}
