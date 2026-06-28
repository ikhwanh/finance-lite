import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { controls } from "../styles/shared";
import { getSettings, saveSettings } from "../db/db";
import { exportJSON, importJSON, downloadFile } from "../domain/io";
import { verifyToken } from "../domain/gist";
import { pushToGist, pullFromGist } from "../domain/sync";

type Status = { kind: "ok" | "err"; text: string } | null;
type Theme = "light" | "dark";

@customElement("pf-settings-page")
export class SettingsPage extends LitElement {
  static override styles = [
    controls,
    css`
      :host {
        display: block;
        max-width: 640px;
        margin: 0 auto;
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
        margin: 0 0 0.3rem;
        font-size: 1.05rem;
      }
      .sub {
        font-size: 0.82rem;
        color: var(--pf-text-muted);
        margin: 0 0 1rem;
      }
      .btns {
        display: flex;
        gap: 0.6rem;
        flex-wrap: wrap;
      }
      .status {
        margin-top: 0.9rem;
        font-size: 0.85rem;
      }
      .status.ok {
        color: var(--pf-ok);
      }
      .status.err {
        color: var(--pf-danger);
      }
      .muted {
        color: var(--pf-text-muted);
        font-size: 0.8rem;
      }
      .linked {
        font-size: 0.8rem;
        color: var(--pf-text-muted);
        margin-top: 0.5rem;
        word-break: break-all;
      }
      a {
        color: var(--pf-primary);
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
      input[type="file"] {
        display: none;
      }
      .seg {
        display: inline-flex;
        gap: 0.2rem;
        padding: 0.2rem;
        background: var(--pf-surface-2);
        border: 1px solid var(--pf-border);
        border-radius: 999px;
      }
      .seg button {
        border: none;
        background: transparent;
        border-radius: 999px;
        padding: 0.4rem 0.9rem;
        color: var(--pf-text-muted);
        font-weight: 500;
      }
      .seg button:hover {
        background: transparent;
        color: var(--pf-text);
      }
      .seg button.on {
        background: var(--pf-surface);
        color: var(--pf-text);
        box-shadow: 0 1px 2px var(--pf-shadow);
      }
    `,
  ];

  @state() private theme: Theme = currentTheme();

  @state() private token = "";
  @state() private gistId?: string;
  @state() private login = "";
  @state() private busy = false;
  @state() private fileStatus: Status = null;
  @state() private gistStatus: Status = null;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadSettings();
  }

  private async loadSettings(): Promise<void> {
    const s = await getSettings();
    this.token = s.githubToken ?? "";
    this.gistId = s.gistId;
  }

  private setTheme(theme: Theme): void {
    this.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("pf-theme", theme);
  }

  // ---- file export / import ----

  private async onExportFile(): Promise<void> {
    try {
      const json = await exportJSON();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadFile(`finance-lite-${stamp}.json`, json, "application/json");
      this.fileStatus = { kind: "ok", text: "Exported backup file." };
    } catch (e) {
      this.fileStatus = { kind: "err", text: errMsg(e) };
    }
  }

  private async onImportFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow re-importing the same file
    if (!file) return;
    if (!confirm("Importing replaces ALL current data with the file's contents. Continue?")) {
      return;
    }
    try {
      const text = await file.text();
      const counts = await importJSON(text);
      this.fileStatus = {
        kind: "ok",
        text: `Imported ${counts.cycles} cycles, ${counts.crops} crops, ${counts.costs} costs.`,
      };
      this.dispatchEvent(new CustomEvent("imported", { bubbles: true, composed: true }));
    } catch (err) {
      this.fileStatus = { kind: "err", text: errMsg(err) };
    }
  }

  // ---- token + gist ----

  private async onSaveToken(): Promise<void> {
    this.busy = true;
    this.gistStatus = null;
    try {
      const t = this.token.trim();
      this.login = t ? await verifyToken(t) : "";
      await saveSettings({ githubToken: t || undefined });
      this.gistStatus = t
        ? { kind: "ok", text: `Token saved and verified as @${this.login}.` }
        : { kind: "ok", text: "Token cleared." };
    } catch (e) {
      this.gistStatus = { kind: "err", text: errMsg(e) };
    } finally {
      this.busy = false;
    }
  }

  private async onPush(): Promise<void> {
    this.busy = true;
    this.gistStatus = null;
    try {
      const res = await pushToGist();
      this.gistId = res.gistId;
      this.gistStatus = { kind: "ok", text: "Pushed to gist." };
    } catch (e) {
      this.gistStatus = { kind: "err", text: errMsg(e) };
    } finally {
      this.busy = false;
    }
  }

  private async onPull(): Promise<void> {
    if (!confirm("Pulling replaces ALL current data with the gist's contents. Continue?")) {
      return;
    }
    this.busy = true;
    this.gistStatus = null;
    try {
      const counts = await pullFromGist();
      this.gistStatus = { kind: "ok", text: `Pulled ${counts.cycles} cycles from gist.` };
      this.dispatchEvent(new CustomEvent("imported", { bubbles: true, composed: true }));
    } catch (e) {
      this.gistStatus = { kind: "err", text: errMsg(e) };
    } finally {
      this.busy = false;
    }
  }

  override render() {
    return html`
      <div class="topbar">
        <h2>Settings &amp; sync</h2>
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
        <h3>Appearance</h3>
        <p class="sub">Choose how Finance Lite looks on this device.</p>
        <div class="seg" role="group" aria-label="Theme">
          <button
            class=${this.theme === "light" ? "on" : ""}
            @click=${() => this.setTheme("light")}
          >
            ☀️ Light
          </button>
          <button
            class=${this.theme === "dark" ? "on" : ""}
            @click=${() => this.setTheme("dark")}
          >
            🌙 Dark
          </button>
        </div>
      </div>

      <div class="card">
        <h3>Backup file</h3>
        <p class="sub">
          Download all your data as a JSON file, or restore from one. No account needed.
        </p>
        <div class="btns">
          <button class="primary" @click=${this.onExportFile}>Export file</button>
          <button @click=${() => this.fileInput.click()}>Import file…</button>
          <input
            id="file"
            type="file"
            accept="application/json,.json"
            @change=${this.onImportFile}
          />
        </div>
        ${this.fileStatus
          ? html`<p class="status ${this.fileStatus.kind}">${this.fileStatus.text}</p>`
          : ""}
      </div>

      <div class="card">
        <h3>GitHub Gist sync</h3>
        <p class="sub">
          Sync across devices via a private gist. Create a token with only the
          <strong>gist</strong> scope at
          <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer"
            >github.com/settings/tokens</a
          >.
        </p>
        <div class="field">
          <label>Personal access token</label>
          <input
            type="password"
            placeholder="ghp_…"
            .value=${this.token}
            @input=${(e: Event) => (this.token = (e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="btns">
          <button @click=${this.onSaveToken} ?disabled=${this.busy}>Save &amp; verify</button>
          <button class="primary" @click=${this.onPush} ?disabled=${this.busy}>
            Push to gist
          </button>
          <button @click=${this.onPull} ?disabled=${this.busy || !this.gistId}>
            Pull from gist
          </button>
        </div>
        ${this.gistId
          ? html`<p class="linked">
              Linked gist:
              <a href="https://gist.github.com/${this.gistId}" target="_blank" rel="noreferrer"
                >${this.gistId}</a
              >
            </p>`
          : html`<p class="muted" style="margin-top:0.5rem">
              No gist linked yet — your first push creates one.
            </p>`}
        ${this.gistStatus
          ? html`<p class="status ${this.gistStatus.kind}">${this.gistStatus.text}</p>`
          : ""}
        <p class="muted" style="margin-top:0.9rem">
          The token is stored locally in your browser (IndexedDB) and is never included in
          exported or synced data.
        </p>
      </div>
    `;
  }

  private get fileInput(): HTMLInputElement {
    return this.renderRoot.querySelector("#file") as HTMLInputElement;
  }
}

function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

declare global {
  interface HTMLElementTagNameMap {
    "pf-settings-page": SettingsPage;
  }
}
