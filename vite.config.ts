import { defineConfig, type Plugin } from "vite";
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
  plugins: [spaRouting()],
  build: {
    target: "es2022",
    outDir: "dist",
  },
  server: {
    port: 5174,
    host: true,
  },
});
