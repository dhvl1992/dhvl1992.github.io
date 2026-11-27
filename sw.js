// dhvl1992 service worker (scope "/").
// 1. Lets Chrome offer "Install app" (one app for everything).
// 2. Receives videos/audio shared from Gallery/WhatsApp ("Share → dhvl1992", see share_target in manifest.json),
//    keeps the file for a moment in browser storage, and opens ReelScribe, which picks it up.
// It does NOT cache app pages: every app always loads the latest version from GitHub.
const SHARE_INBOX = "share-inbox";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.pathname === "/share-target/") {
    e.respondWith(receiveShare(e.request));
  }
  // everything else: pass-through (the browser fetches normally)
});

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const file = form.get("media");
    if (file && typeof file !== "string") {
      const cache = await caches.open(SHARE_INBOX);
      await cache.put("/shared-file", new Response(file, {
        headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name || "shared") },
      }));
      return Response.redirect("/Reelscribe/?shared=1", 303);
    }
  } catch (err) { /* fall through */ }
  return Response.redirect("/Reelscribe/?shared=0", 303);
}
