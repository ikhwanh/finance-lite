import { registerSW } from "virtual:pwa-register";

// Register the service worker for offline support. With registerType
// "autoUpdate" the plugin swaps in a freshly built SW as soon as it's ready;
// we reload once it takes control so the running tab picks up the new assets.
export function registerServiceWorker(): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      updateSW(true);
    },
    onOfflineReady() {
      // App shell is cached and ready to work offline.
    },
  });
}
