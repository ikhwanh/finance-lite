import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { controls } from "../styles/shared";
import {
  listCyclesWithCosts,
  getMonthlyOverhead,
  listWithdrawals,
  addWithdrawal,
  deleteWithdrawal,
  type CycleWithCosts,
} from "../db/db";
import type { Withdrawal } from "../domain/types";
import {
  totalRealizedProfit,
  totalProjectedProfit,
  totalWithdrawn,
} from "../domain/calc";
import { formatRupiah } from "../domain/format";

@customElement("pf-ledger-page")
export class LedgerPage extends LitElement {
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
      .line {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 0.45rem 0;
        gap: 0.6rem;
      }
      .line .k {
        color: var(--pf-text-muted);
      }
      .line .v {
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        font-weight: 600;
      }
      .rule {
        border: none;
        border-top: 1px solid var(--pf-border);
        margin: 0.4rem 0;
      }
      .retained {
        font-size: 1.25rem;
        font-weight: 800;
      }
      .projected {
        margin-top: 0.9rem;
        font-size: 0.82rem;
        color: var(--pf-text-muted);
        display: flex;
        justify-content: space-between;
        gap: 0.6rem;
      }
      .pos {
        color: var(--pf-ok);
      }
      .neg {
        color: var(--pf-danger);
      }
      .add-row {
        display: grid;
        grid-template-columns: 1fr 1fr 1.4fr auto;
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
      .warn {
        background: color-mix(in srgb, var(--pf-danger) 14%, transparent);
        color: var(--pf-danger);
        border-radius: var(--pf-radius-sm);
        padding: 0.6rem 0.8rem;
        font-size: 0.82rem;
        margin-top: 0.9rem;
      }
    `,
  ];

  @state() private records: CycleWithCosts[] = [];
  @state() private monthlyOverhead = 0;
  @state() private withdrawals: Withdrawal[] = [];
  @state() private fDate = todayISO();
  @state() private fAmount = "";
  @state() private fNote = "";
  @state() private error = "";

  override connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    const [records, monthlyOverhead, withdrawals] = await Promise.all([
      listCyclesWithCosts(),
      getMonthlyOverhead(),
      listWithdrawals(),
    ]);
    this.records = records;
    this.monthlyOverhead = monthlyOverhead;
    this.withdrawals = withdrawals;
  }

  private async add(): Promise<void> {
    this.error = "";
    const amount = Number(this.fAmount);
    if (!this.fDate) return void (this.error = "Date is required.");
    if (!Number.isFinite(amount) || amount <= 0)
      return void (this.error = "Enter an amount greater than zero.");
    await addWithdrawal({
      date: this.fDate,
      amount: Math.round(amount),
      note: this.fNote.trim() || undefined,
    });
    this.fAmount = "";
    this.fNote = "";
    this.fDate = todayISO();
    await this.load();
  }

  private async removeWithdrawal(id: number): Promise<void> {
    await deleteWithdrawal(id);
    await this.load();
  }

  override render() {
    const realized = totalRealizedProfit(this.records, this.monthlyOverhead);
    const withdrawn = totalWithdrawn(this.withdrawals);
    const retained = realized - withdrawn;
    const projected = totalProjectedProfit(this.records, this.monthlyOverhead);

    return html`
      <div class="topbar">
        <h2>Profit &amp; cash</h2>
      </div>

      <div class="card">
        <h3>Where the money stands</h3>
        <p class="sub">
          Realized profit counts only harvested cycles with actual yield &amp; price recorded.
          Withdrawals are what you've taken out. The difference is what's still in the business.
        </p>
        <div class="line">
          <span class="k">Realized profit</span>
          <span class="v ${cls(realized)}">${formatRupiah(realized)}</span>
        </div>
        <div class="line">
          <span class="k">Withdrawals</span>
          <span class="v">− ${formatRupiah(withdrawn)}</span>
        </div>
        <hr class="rule" />
        <div class="line retained">
          <span>Retained in business</span>
          <span class="${cls(retained)}">${formatRupiah(retained)}</span>
        </div>
        ${retained < 0
          ? html`<div class="warn">
              You've withdrawn more than you've realized — you're drawing on money the business
              hasn't earned yet.
            </div>`
          : ""}
        <div class="projected">
          <span>ⓘ Projected (not yet realized)</span>
          <span>${formatRupiah(projected)}</span>
        </div>
      </div>

      <div class="card">
        <h3>Add a withdrawal</h3>
        <p class="sub">Money you took out of the business — an owner draw.</p>
        <div class="add-row">
          <div class="field">
            <label>Date</label>
            <input type="date" .value=${this.fDate} @input=${(e: Event) => (this.fDate = val(e))} />
          </div>
          <div class="field">
            <label>Amount (Rp)</label>
            <input
              type="number"
              placeholder="1000000"
              .value=${this.fAmount}
              @input=${(e: Event) => (this.fAmount = val(e))}
              @keydown=${(e: KeyboardEvent) => e.key === "Enter" && this.add()}
            />
          </div>
          <div class="field">
            <label>Note</label>
            <input
              placeholder="owner draw"
              .value=${this.fNote}
              @input=${(e: Event) => (this.fNote = val(e))}
            />
          </div>
          <button class="primary" @click=${this.add}>Add</button>
        </div>
        ${this.error ? html`<p class="err">${this.error}</p>` : ""}
      </div>

      <div class="card">
        ${this.withdrawals.length === 0
          ? html`<div class="empty">No withdrawals yet.</div>`
          : html`<table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Note</th>
                  <th class="num">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${this.withdrawals.map(
                  (w) => html`<tr>
                    <td>${formatDate(w.date)}</td>
                    <td>${w.note ?? ""}</td>
                    <td class="num">${formatRupiah(w.amount)}</td>
                    <td class="num">
                      <button class="ghost del" @click=${() => this.removeWithdrawal(w.id!)}>
                        ✕
                      </button>
                    </td>
                  </tr>`,
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total withdrawn</td>
                  <td></td>
                  <td class="num">${formatRupiah(totalWithdrawn(this.withdrawals))}</td>
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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function cls(n: number): string {
  return n >= 0 ? "pos" : "neg";
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-ledger-page": LedgerPage;
  }
}
