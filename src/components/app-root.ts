import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Router } from "@lit-labs/router";
import { controls } from "../styles/shared";
import {
  listCyclesWithCosts,
  getCycleWithCosts,
  listCrops,
  deleteCycle,
  getMonthlyOverhead,
  type CycleWithCosts,
} from "../db/db";
import type { Crop } from "../domain/types";
import { breakEvenPricePerKg, profitAtExpectedPrice, withOverhead } from "../domain/calc";
import { formatRupiah } from "../domain/format";
import { BASE, paths, patterns } from "../router";
import "./cycle-editor";
import "./settings-page";
import "./price-page";
import "./scenario-page";
import "./overhead-page";

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

  @state() private cycles: CycleWithCosts[] = [];
  @state() private crops: Crop[] = [];
  @state() private monthlyOverhead = 0;

  // The cycle currently being edited, loaded by the `:id` route's enter()
  // hook (or null for a new cycle). Stored here so render() can read it.
  private editRecord: CycleWithCosts | null = null;

  // Declarative route table. @lit-labs/router matches each `path` against the
  // full pathname and renders the matching `render()` into outlet(). The
  // fallback covers the bare base URL and any unknown path.
  private readonly router = new Router(
    this,
    [
      { path: paths.list, render: () => this.renderList() },
      { path: paths.newCycle, render: () => this.renderEdit(null) },
      {
        path: patterns.cycleById,
        // Load the record before rendering so deep links survive a reload;
        // an unknown id redirects to the list and cancels this navigation.
        enter: async ({ id }) => {
          const record = await getCycleWithCosts(Number(id));
          if (!record) {
            this.navigate(paths.list, { replace: true });
            return false;
          }
          this.editRecord = record;
          return true;
        },
        render: () => this.renderEdit(this.editRecord),
      },
      {
        path: paths.scenarios,
        render: () => html`<pf-scenario-page @close=${this.goList}></pf-scenario-page>`,
      },
      {
        path: paths.prices,
        render: () => html`<pf-price-page @close=${this.goList}></pf-price-page>`,
      },
      {
        path: paths.overhead,
        render: () => html`<pf-overhead-page
          @close=${this.goList}
          @changed=${this.onImported}
        ></pf-overhead-page>`,
      },
      {
        path: paths.settings,
        render: () => html`<pf-settings-page
          @close=${this.goList}
          @imported=${this.onImported}
        ></pf-settings-page>`,
      },
    ],
    { fallback: { render: () => this.renderList() } },
  );

  override connectedCallback(): void {
    // Normalise the bare base URL (the PWA start_url) to the cycles list so
    // the router has a concrete route and the tab highlights. Done before
    // super.connectedCallback(), which kicks off the router's first match.
    if (window.location.pathname.replace(/\/$/, "") === BASE) {
      window.history.replaceState({}, "", paths.list);
    }
    super.connectedCallback();
    void this.load();
  }

  // Navigates to an absolute path: updates history, then asks the router to
  // render the match. `replace` swaps the current entry instead of pushing.
  private readonly navigate = (path: string, opts?: { replace?: boolean }): void => {
    if (window.location.pathname !== path) {
      window.history[opts?.replace ? "replaceState" : "pushState"]({}, "", path);
    }
    void this.router.goto(path);
  };

  private readonly goList = (): void => this.navigate(paths.list);

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
    this.navigate(paths.newCycle);
  }

  private openEdit(record: CycleWithCosts): void {
    this.navigate(paths.cycle(record.cycle.id!));
  }

  private async onSaved(): Promise<void> {
    await this.load();
    this.goList();
  }

  private async onDelete(id: number): Promise<void> {
    await deleteCycle(id);
    await this.load();
    this.goList();
  }

  private async onImported(): Promise<void> {
    await this.load();
  }

  override render() {
    const path = window.location.pathname;
    const isActive = (p: string): boolean => path === p;
    const cyclesActive = path.startsWith(paths.list);
    return html`
      <header>
        <nav>
          <button
            class="tab ${cyclesActive ? "active" : ""}"
            @click=${() => this.navigate(paths.list)}
          >
            Crop cycles
          </button>
          <button
            class="tab ${isActive(paths.scenarios) ? "active" : ""}"
            @click=${() => this.navigate(paths.scenarios)}
          >
            Compare what-ifs
          </button>
          <button
            class="tab ${isActive(paths.prices) ? "active" : ""}"
            @click=${() => this.navigate(paths.prices)}
          >
            Market prices
          </button>
          <button
            class="tab ${isActive(paths.overhead) ? "active" : ""}"
            @click=${() => this.navigate(paths.overhead)}
          >
            Overhead
          </button>
        </nav>
        <button
          class="ghost icon-btn ${isActive(paths.settings) ? "active" : ""}"
          @click=${() => this.navigate(paths.settings)}
          title="Settings"
          aria-label="Settings"
        >
          ⚙️
        </button>
      </header>
      <main>${this.router.outlet()}</main>
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

  private renderEdit(record: CycleWithCosts | null) {
    return html`
      <pf-cycle-editor
        .record=${record}
        .cropName=${record ? this.cropName(record.cycle.cropId) : ""}
        .monthlyOverhead=${this.monthlyOverhead}
        @saved=${this.onSaved}
        @close=${this.goList}
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
