// =========================================================
// dhvl1992 — shared top bar for EVERY app (single source of truth)
// Add to any app:   <script src="/topbar.js"></script>   (put it at the end of <body>)
// Change this file once → every app's bar changes.
//
// - Left: logo + "dhvl1992 › App name" → tap goes home (/)
// - Right: account button (your MyBrain login) → menu: Open MyBrain, Install as app, Log out
// - Phone: hides when you scroll down, comes back when you scroll up
// - Sealed (Shadow DOM): app CSS can't break the bar, the bar can't break the app
// - Apps can use var(--topbar-h) to keep fixed parts below the bar (it becomes 0px while the bar is off)
// - var(--topbar-y) = how much of the bar is visible right now (0px when it slid away on a phone) — use it
//   for fixed overlays (side pages) so they sit exactly under the bar
// - Full-screen modes (reading a book, a game): document.dispatchEvent(new Event("topbar:off")) / ("topbar:on")
// =========================================================
(function () {
  if (window.__topbar) return; // only once per page
  window.__topbar = true;
  // Catch Chrome's "you can install" signal early, before the bar is built
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); window.__installPrompt = e; });

  const BAR_H = 64;
  const SB_KEY = "sb-yncbwqhytcxkqrlonkkk-auth-token"; // MyBrain's login, saved by Supabase in this browser

  function start() {
    try { build(); } catch (e) { console.warn("topbar failed — app keeps working", e); }
  }
  // apps.js holds the app list; load it if this page hasn't
  if (window.HUB) start();
  else {
    const s = document.createElement("script");
    s.src = "/apps.js";
    s.onload = start;
    s.onerror = () => { window.HUB = { name: "dhvl1992", apps: [], logo: "", current: null }; start(); };
    document.head.appendChild(s);
  }

  function readEmail() {
    try { return JSON.parse(localStorage.getItem(SB_KEY) || "null")?.user?.email || ""; } catch { return ""; }
  }

  function build() {
    const H = window.HUB, here = H.current;
    const host = document.createElement("div");
    host.id = "dhvl-topbar";
    document.documentElement.style.setProperty("--topbar-h", BAR_H + "px");
    document.documentElement.style.setProperty("--topbar-y", BAR_H + "px");
    const root = host.attachShadow({ mode: "open" });
    const email = readEmail();
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    root.innerHTML = `
<style>
  .bar{all:initial; display:block; box-sizing:border-box; height:${BAR_H}px;
       font:400 17px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#111; text-align:left; background:rgba(250,250,250,.88); -webkit-backdrop-filter:saturate(1.4) blur(12px); backdrop-filter:saturate(1.4) blur(12px);
       box-shadow:0 1px 0 rgba(0,0,0,.04)}
  .in{max-width:1180px; height:100%; margin:0 auto; padding:0 24px; display:flex; align-items:center; justify-content:space-between; box-sizing:border-box}
  a{color:inherit; text-decoration:none}
  .brand{display:flex; align-items:center; gap:12px; min-width:0; font-size:20px; font-weight:500; letter-spacing:-.01em}
  .brand svg{width:36px; height:36px; flex:none}
  .crumb{color:var(--muted, #757575); font-weight:400; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .acct{position:relative}
  .avatar{width:40px; height:40px; border-radius:50%; border:0; background:var(--soft, #efefef); color:var(--muted, #757575); cursor:pointer;
          display:grid; place-items:center; font-family:inherit; font-size:16px; font-weight:500; line-height:1; padding:0}
  .avatar svg{width:22px; height:22px}
  .avatar.on{background:var(--ink, #111); color:#fff}
  .menu{position:absolute; right:0; top:48px; min-width:280px; max-width:calc(100vw - 32px); background:#fff; border-radius:16px;
        box-shadow:0 8px 30px rgba(0,0,0,.12); padding:8px; display:flex; flex-direction:column; box-sizing:border-box}
  .menu[hidden]{display:none}
  .who{font-size:14px; color:var(--muted, #757575); padding:8px 12px 12px; overflow-wrap:anywhere}
  .menu a, .menu button{display:block; text-align:left; border:0; background:none; padding:12px; border-radius:12px; font:inherit; font-size:15px; color:inherit; cursor:pointer}
  .menu a:hover, .menu button:hover{background:var(--soft, #efefef)}
  .out{color:var(--warn, #c2562a) !important}
  [hidden]{display:none !important}
  @media (max-width:600px){ .in{padding:0 16px} .brand{font-size:18px; gap:10px} .brand svg{width:32px; height:32px} }
</style>
<div class="bar"><div class="in">
  <a class="brand" href="${esc(H.home || "/")}" id="home" aria-label="${esc(H.name)} home">
    <svg viewBox="0 0 64 64" aria-hidden="true">${H.logo || ""}</svg>
    <span>${esc(H.name)}</span>${here ? `<span class="crumb">\u203A ${esc(here.name)}</span>` : ""}
  </a>
  <div class="acct">
    <button class="avatar ${email ? "on" : ""}" id="btn" aria-label="Account and settings" aria-haspopup="menu" aria-expanded="false" title="${esc(email)}">
      ${email ? esc(email[0].toUpperCase())
              : `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4" fill="currentColor"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6z" fill="currentColor"/></svg>`}
    </button>
    <div class="menu" id="menu" role="menu" hidden>
      <div class="who">${email ? "Signed in as " + esc(email) : "Not logged in"}</div>
      <a role="menuitem" href="/">Home</a>
      <a role="menuitem" href="/mybrain/">${email ? "Open MyBrain" : "Log in to MyBrain"}</a>
      <button role="menuitem" id="install" hidden>Install as app</button>
      <button role="menuitem" id="logout" class="out" ${email ? "" : "hidden"}>Log out</button>
    </div>
  </div>
</div></div>`;

    // Lock the outer frame with inline !important (beats any app CSS, even "* {... !important}")
    const lock = { all: "initial", display: "block", position: "sticky", top: "0", "z-index": "2147483000",
                   transition: "transform .25s ease", transform: "none" };
    for (const [k, v] of Object.entries(lock)) host.style.setProperty(k, v, "important");
    document.body.prepend(host);
    const $ = (id) => root.getElementById(id);
    const menu = $("menu"), btn = $("btn");

    // Menu open / close
    const toggle = (open = menu.hidden) => { menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
    document.addEventListener("click", (e) => { if (!menu.hidden && !e.composedPath().includes(host)) toggle(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) toggle(false); });

    // Home: already home → scroll to top (like tapping Instagram's logo)
    $("home").addEventListener("click", (e) => {
      if (location.pathname !== "/") return;
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.dispatchEvent(new CustomEvent("topbar:home"));
    });

    // Install as app: one installable app for everything (scope "/")
    let prompt = window.__installPrompt || null;
    const showInstall = () => { $("install").hidden = !prompt; };
    window.addEventListener("beforeinstallprompt", (e) => { prompt = e; showInstall(); });
    showInstall();
    $("install").addEventListener("click", async () => {
      if (!prompt) return;
      prompt.prompt(); await prompt.userChoice; prompt = null; showInstall(); toggle(false);
    });

    // Log out: this browser only (other devices stay logged in). Loads Supabase only when needed.
    $("logout").addEventListener("click", async () => {
      try {
        if (!window.supabase) await new Promise((ok, fail) => { const s = document.createElement("script"); s.src = "/mybrain/vendor/supabase.js"; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
        const db = supabase.createClient("https://yncbwqhytcxkqrlonkkk.supabase.co", "sb_publishable_Sf-aeTSLVtF1aR2-KUSWMA_ecVQidxd", { auth: { autoRefreshToken: false } });
        await db.auth.signOut({ scope: "local" });
      } catch { try { localStorage.removeItem(SB_KEY); } catch {} }
      location.reload();
    });

    // Apps can switch the bar off for full-screen modes, and back on
    const setOff = (off) => {
      host.style.setProperty("display", off ? "none" : "block", "important");
      document.documentElement.style.setProperty("--topbar-h", off ? "0px" : BAR_H + "px");
      document.documentElement.style.setProperty("--topbar-y", off ? "0px" : BAR_H + "px");
      if (off) toggle(false);
    };
    document.addEventListener("topbar:off", () => setOff(true));
    document.addEventListener("topbar:on", () => setOff(false));
    if (window.__topbarOff) setOff(true); // the app asked before the bar was ready

    // Phone: hide on scroll down, show on scroll up
    function setHidden(h) {
      host.style.setProperty("transform", h ? "translateY(-100%)" : "none", "important");
      document.documentElement.style.setProperty("--topbar-y", h ? "0px" : BAR_H + "px");
      host.classList.toggle("hidden", h);
    }
    let lastY = window.scrollY;
    window.addEventListener("scroll", () => {
      const y = window.scrollY;
      if (window.innerWidth <= 800 && y > BAR_H && y > lastY + 4) { setHidden(true); toggle(false); }
      else if (y < lastY - 4 || y <= BAR_H) setHidden(false);
      lastY = y;
    }, { passive: true });
  }
})();
