// Minimal service worker.
// It does NOT cache anything, so every app always loads the latest code from GitHub.
// Its only job: let Chrome offer "Install app".
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // pass-through: the browser fetches normally
