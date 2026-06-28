// Central route table for the app.
//
// @lit-labs/router matches against the *full* `location.pathname`, with no
// base-path stripping. On a GitHub Pages project site the app is served under
// `/finance-lite/`, so every route — and every link we generate — must include
// that base. We take it from Vite's `import.meta.env.BASE_URL` so the same code
// works locally (`/`) and in production (`/finance-lite/`).

/** The app's base path without a trailing slash, e.g. "" or "/finance-lite". */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Concrete paths to navigate to (links, `history.pushState`, redirects). */
export const paths = {
  list: `${BASE}/crop_cycles`,
  newCycle: `${BASE}/crop_cycles/new`,
  cycle: (id: number): string => `${BASE}/crop_cycles/${id}`,
  scenarios: `${BASE}/scenarios`,
  prices: `${BASE}/market_prices`,
  overhead: `${BASE}/overhead`,
  settings: `${BASE}/settings`,
} as const;

/** URLPattern pathname strings for the router (with `:param` placeholders). */
export const patterns = {
  cycleById: `${BASE}/crop_cycles/:id`,
} as const;
