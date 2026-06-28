import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { controls } from "../styles/shared";
import { listOverheads, addOverhead, deleteOverhead } from "../db/db";
import type { Overhead } from "../domain/types";
import { formatRupiah } from "../domain/format";

@customElement("pf-overhead-page")
export class OverheadPage extends LitElement {
  static override styles = [
    controls,
    css`
      :host {
        display: block;
        max-width: 680px;
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
      }
      h3 {
        margin: 0 0 0.3rem;
        font-size: 1.05rem;
      }
      .sub {
        font-size: 0.82rem;
        color: var(--pf-text-muted);
        margin: 0 0 1rem;
      }
      .add-row {
        display: grid;
        grid-template-columns: 1.6fr 1fr auto;
        gap: 0.6rem;
        align-items: end;
      }
      .field {
        margin: 0;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
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
        padding: 0.5rem;
        border-bottom: 1px solid var(--pf-border);
      }
      td.num {
        text-align: right;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      tfoot td {
        font-weight: 700;
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
      .note {
        font-size: 0.8rem;
        color: var(--pf-text-muted);
        margin-top: 0.8rem;
        line-height: 1.5;
      }
    `,
  ];

  @state() private items: Overhead[] = [];
  @state() private fLabel = "";
  @state() private fAmount = "";
  @state() private error = "";

  override connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    this.items = await listOverheads();
  }

  private async add(): Promise<void> {
    this.error = "";
    const amount = Number(this.fAmount);
    if (!this.fLabel.trim()) return void (this.error = "Label is required.");
    if (!Number.isFinite(amount) || amount <= 0)
      return void (this.error = "Enter a monthly amount greater than zero.");
    await addOverhead({ label: this.fLabel.trim(), amountPerMonth: Math.round(amount) });
    this.fLabel = "";
    this.fAmount = "";
    await this.load();
    this.dispatchEvent(new CustomEvent("changed", { bubbles: true, composed: true }));
  }

  private async removeOverhead(id: number): Promise<void> {
    await deleteOverhead(id);
    await this.load();
    this.dispatchEvent(new CustomEvent("changed", { bubbles: true, composed: true }));
  }

  override render() {
    const total = this.items.reduce((s, o) => s + o.amountPerMonth, 0);
    return html`
      <div class="topbar">
        <h2>Overhead</h2>
        <span class="spacer"></span>
        <button
          class="ghost"
          @click=${() =>
            this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }))}
        >
          ← Back
        </button>
      </div>

      <div class="card">
        <h3>Shared monthly costs</h3>
        <p class="sub">
          Rent, utilities, tools — costs that aren't tied to one cycle. Each cycle automatically
          carries a share based on how many months it runs.
        </p>
        <div class="add-row">
          <div class="field">
            <label>Label</label>
            <input
              placeholder="Yard rent"
              .value=${this.fLabel}
              @input=${(e: Event) => (this.fLabel = val(e))}
            />
          </div>
          <div class="field">
            <label>Rp / month</label>
            <input
              type="number"
              placeholder="500000"
              .value=${this.fAmount}
              @input=${(e: Event) => (this.fAmount = val(e))}
              @keydown=${(e: KeyboardEvent) => e.key === "Enter" && this.add()}
            />
          </div>
          <button class="primary" @click=${this.add}>Add</button>
        </div>
        ${this.error ? html`<p class="err">${this.error}</p>` : ""}
        <p class="note">
          💡 For a durable tool, divide its price by its useful life in months and enter that as
          the monthly amount — e.g. a Rp 600.000 sprayer lasting 3 years → Rp 17.000/month.
        </p>
      </div>

      <div class="card">
        ${this.items.length === 0
          ? html`<div class="empty">No overhead yet. Add rent, utilities, or tools above.</div>`
          : html`<table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="num">Rp / month</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${this.items.map(
                  (o) => html`<tr>
                    <td>${o.label}</td>
                    <td class="num">${formatRupiah(o.amountPerMonth)}</td>
                    <td class="num">
                      <button class="ghost del" @click=${() => this.removeOverhead(o.id!)}>
                        ✕
                      </button>
                    </td>
                  </tr>`,
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total pool</td>
                  <td class="num">${formatRupiah(total)}/mo</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>`}
      </div>
    `;
  }
}

function val(e: Event): string {
  return (e.target as HTMLInputElement).value;
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-overhead-page": OverheadPage;
  }
}
