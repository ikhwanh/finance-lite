// ---- Gist sync: push/pull the JSON backup to a private Gist ----

import { getSettings, saveSettings } from "../db/db";
import { exportJSON, importJSON, type ImportCounts } from "./io";
import { upsertGist, fetchGistFile } from "./gist";

export const GIST_FILENAME = "finance-lite-backup.json";

/** Push all local data to the linked gist (creating it on first push). */
export async function pushToGist(): Promise<{ gistId: string; htmlUrl: string }> {
  const s = await getSettings();
  if (!s.githubToken) throw new Error("Add a GitHub token first.");

  const content = await exportJSON();
  const res = await upsertGist({
    token: s.githubToken,
    gistId: s.gistId,
    filename: GIST_FILENAME,
    content,
    description: "finance-lite backup",
  });

  if (res.gistId !== s.gistId) await saveSettings({ gistId: res.gistId });
  return { gistId: res.gistId, htmlUrl: res.htmlUrl };
}

/** Replace local data with the linked gist's contents. */
export async function pullFromGist(): Promise<ImportCounts> {
  const s = await getSettings();
  if (!s.githubToken) throw new Error("Add a GitHub token first.");
  if (!s.gistId) throw new Error("No gist linked yet — push once to create one.");

  const content = await fetchGistFile({
    token: s.githubToken,
    gistId: s.gistId,
    filename: GIST_FILENAME,
  });
  return importJSON(content);
}
