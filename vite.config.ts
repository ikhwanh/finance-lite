import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { copyFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// GitHub Pages serves the app under /finance-lite/. History-API routing needs an
// absolute base so assets resolve at any path depth; import.meta.env.BASE_URL
// (derived from this) also drives the route table.
const base = "/finance-lite/";

// Support History-API routing on GitHub Pages:
//  - Rewrite relative public-asset links (manifest, icons) to absolute base
//    paths so they resolve on a hard reload of a deep link, not just the root.
//  - Emit a 404.html identical to index.html; Pages serves it for any unknown
//    path (e.g. reloading /finance-lite/crop_cycles/2), booting the same SPA so
//    the router can resolve the deep link.
const spaRouting = (): Plugin => ({
  name: "spa-routing",
  transformIndexHtml(html) {
    return html.replace(/(href|src)="\.\//g, `$1="${base}`);
  },
  closeBundle() {
    const out = resolve(__dirname, "dist");
    copyFileSync(resolve(out, "index.html"), resolve(out, "404.html"));
  },
});

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    spaRouting(),
    VitePWA({
      // Ship a new service worker as soon as it's built; the app reloads to it
      // via registerSW's autoUpdate flow (see src/pwa.ts).
      registerType: "autoUpdate",
      // Precache the SVG icon and inline favicon target so the installed app has
      // its chrome available offline. Everything else is fingerprinted build
      // output and picked up by workbox.globPatterns below.
      includeAssets: ["icon.svg"],
      // The plugin owns manifest generation and injects the <link rel="manifest">
      // tag, so index.html no longer references public/manifest.webmanifest.
      manifest: {
        name: "Finance Lite",
        short_name: "Finance Lite",
        description:
          "Local-first crop-farm financial planner: cost tracking, break-even, seasonal pricing.",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#2f7d4f",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Include the bundled webfonts on top of workbox's default globs so the
        // app is fully styled offline.
        globPatterns: ["**/*.{js,css,html,svg,ico,png,woff2}"],
        // SPA deep links resolve to the app shell when offline.
        navigateFallback: `${base}index.html`,
        // Don't shadow the GitHub Pages 404.html fallback with the SW.
        navigateFallbackDenylist: [/^\/finance-lite\/404\.html$/],
      },
    }),
  ],
  build: {
    target: "es2022",
    outDir: "dist",
  },
  server: {
    port: 5174,
    host: true,
  },
});
