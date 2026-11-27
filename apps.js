// =========================================================
// dhvl1992 — the ONE list of apps (single source of truth)
// Used by the home page grid AND the shared top bar (/topbar.js).
// Add a new app = add one line to HUB.apps below (+ an icon in HUB.icons).
// =========================================================
(function () {
  const K = "var(--ink, #111)", A = "var(--accent, #3366ee)", S = "var(--soft, #efefef)";
  window.HUB = {
    name: "dhvl1992",
    home: "/",
    // Logo: 4 rounded squares (same as the install icon)
    logo: `<rect width="64" height="64" rx="18" fill="${S}"/>
      <rect x="15" y="15" width="15" height="15" rx="4.5" fill="${K}"/><rect x="34" y="15" width="15" height="15" rx="4.5" fill="${A}"/>
      <rect x="15" y="34" width="15" height="15" rx="4.5" fill="${A}"/><rect x="34" y="34" width="15" height="15" rx="4.5" fill="${K}"/>`,
    // Icons: soft grey tile, black shapes, at most one blue shape (see DESIGN.md)
    icons: {
      brain: `<rect x="14" y="15" width="8" height="8" rx="2" fill="${A}"/><rect x="26" y="17" width="24" height="4" rx="2" fill="${K}"/>
              <rect x="14" y="28" width="8" height="8" rx="2" fill="${A}"/><rect x="26" y="30" width="24" height="4" rx="2" fill="${K}"/>
              <rect x="14" y="41" width="8" height="8" rx="2" fill="${K}"/><rect x="26" y="43" width="16" height="4" rx="2" fill="${K}"/>`,
      sip:   `<rect x="14" y="36" width="9" height="14" rx="2.5" fill="${K}"/><rect x="27.5" y="27" width="9" height="23" rx="2.5" fill="${K}"/>
              <rect x="41" y="16" width="9" height="34" rx="2.5" fill="${A}"/>`,
      book:  `<path d="M12 19 Q22 15 31 19 V48 Q22 44 12 48 Z" fill="${K}"/><path d="M33 19 Q42 15 52 19 V48 Q42 44 33 48 Z" fill="${A}"/>`,
      pdf:   `<rect x="12" y="11" width="24" height="31" rx="4" fill="${K}"/>
              <rect x="26" y="26" width="27" height="27" rx="5" fill="${A}" stroke="${S}" stroke-width="3"/>
              <path d="M31 48 L38 39 L42 44 L45 41 L49 48 Z" fill="${K}"/>`,
      // play → lines of text
      reel:  `<path d="M13 20.5 Q13 17 16 18.7 L28 25.7 Q31 27.5 28 29.3 L16 36.3 Q13 38 13 34.5 Z" fill="${K}"/>
              <rect x="34" y="19" width="17" height="5" rx="2.5" fill="${A}"/><rect x="34" y="27" width="17" height="5" rx="2.5" fill="${K}"/>
              <rect x="34" y="35" width="11" height="5" rx="2.5" fill="${K}"/><rect x="13" y="43" width="38" height="5" rx="2.5" fill="${K}"/>`,
    },
    apps: [
      { name: "MyBrain",        desc: "To-do + notes",        icon: "brain", url: "/mybrain/" },
      { name: "SIP Calculator", desc: "Monthly ETF splitter", icon: "sip",   url: "/sipcalc/" },
      { name: "Quiet Reader",   desc: "Markdown book reader", icon: "book",  url: "/reader/" },
      { name: "PDF to JPG",     desc: "Pages to images",      icon: "pdf",   url: "/pdf2jpg/" },
      { name: "ReelScribe",     desc: "Reel / voice → text",  icon: "reel",  url: "/Reelscribe/" }, // repo name has a capital R; web addresses are case-sensitive
    ],
  };
  // Which app is this page? (longest matching address wins)
  HUB.current = HUB.apps.filter((a) => location.pathname.startsWith(a.url)).sort((a, b) => b.url.length - a.url.length)[0] || null;
  HUB.tile = (k, cls = "ico") => `<svg class="${cls}" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="${S}"/>${HUB.icons[k] || ""}</svg>`;
})();
