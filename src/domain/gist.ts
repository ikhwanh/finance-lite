// Minimal GitHub Gist client. Token needs only the `gist` scope.

const API = "https://api.github.com";

export interface GistFileResult {
  gistId: string;
  htmlUrl: string;
  rawUrl: string; // stable "latest" raw url for the file
  filename: string;
}

interface GistApiResponse {
  id: string;
  html_url: string;
  owner?: { login: string };
  files: Record<string, { raw_url: string; filename: string }>;
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function handle(res: Response): Promise<GistApiResponse> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.message) msg = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(`GitHub Gist error: ${msg}`);
  }
  return res.json();
}

/** Build the stable raw URL that always serves the latest revision of a file. */
function stableRawUrl(gist: GistApiResponse, filename: string): string {
  const login = gist.owner?.login;
  if (login) {
    return `https://gist.githubusercontent.com/${login}/${gist.id}/raw/${encodeURIComponent(filename)}`;
  }
  return gist.files[filename]?.raw_url ?? "";
}

export async function verifyToken(token: string): Promise<string> {
  const res = await fetch(`${API}/user`, { headers: headers(token) });
  if (!res.ok) throw new Error("Token rejected by GitHub (check it has the 'gist' scope).");
  const user = await res.json();
  return user.login as string;
}

/** Create or update a single-file gist. If gistId is given, the file is patched. */
export async function upsertGist(opts: {
  token: string;
  gistId?: string;
  filename: string;
  content: string;
  description?: string;
  public?: boolean;
}): Promise<GistFileResult> {
  const { token, gistId, filename, content, description, public: isPublic } = opts;
  const body = JSON.stringify({
    description: description ?? "finance-lite",
    public: isPublic ?? false,
    files: { [filename]: { content } },
  });

  const res = gistId
    ? await fetch(`${API}/gists/${gistId}`, { method: "PATCH", headers: headers(token), body })
    : await fetch(`${API}/gists`, { method: "POST", headers: headers(token), body });

  const gist = await handle(res);
  return {
    gistId: gist.id,
    htmlUrl: gist.html_url,
    rawUrl: stableRawUrl(gist, filename),
    filename,
  };
}

export async function fetchGistFile(opts: {
  token: string;
  gistId: string;
  filename: string;
}): Promise<string> {
  const { token, gistId, filename } = opts;
  const res = await fetch(`${API}/gists/${gistId}`, { headers: headers(token) });
  const gist = await handle(res);
  const file = gist.files[filename];
  if (!file) throw new Error(`File "${filename}" not found in gist.`);
  const withContent = file as unknown as { content?: string; raw_url: string };
  if (withContent.content != null) return withContent.content;
  const raw = await fetch(withContent.raw_url, { headers: headers(token) });
  return raw.text();
}
