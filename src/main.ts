import "@fontsource-variable/inter/wght.css";
import "./styles/main.scss";
import "./components/app-root";
import { ensurePersistenceOnStartup } from "./db/persist";
import { registerServiceWorker } from "./pwa";

// Theme is applied by an inline script in index.html before the app upgrades.

// Opt out of automatic eviction where the browser will grant it silently;
// Settings exposes an explicit button for browsers that need user intent.
void ensurePersistenceOnStartup();

// Cache the app shell for offline use and auto-update the service worker.
registerServiceWorker();
