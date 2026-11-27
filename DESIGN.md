# dhvl1992 — Design rules

Every app in this project follows ONE look: minimal, quiet, easy on the eyes.
The values live in [`theme.css`](theme.css). Do not invent new colors, fonts or sizes in an app.

## How an app uses it — two shared files, one line each
```html
<link rel="stylesheet" href="/theme.css">      <!-- in <head>: colors, font, spacing, shapes -->
<link rel="manifest" href="/manifest.json">    <!-- in <head>: ONE installable app (dhvl1992) for everything -->
...
<script src="/topbar.js"></script>             <!-- end of <body>: the shared top bar -->
```
`/topbar.js` adds the bar (logo + "dhvl1992 › App name" → home, account menu). It reads the app list from `/apps.js`.
Fixed parts of an app (bottom tabs, side panels) should start below the bar: `top: var(--topbar-h)`.
Full-screen modes (reading a book, a game): `window.__topbarOff = true; document.dispatchEvent(new Event("topbar:off"))`,
and `topbar:on` to bring the bar back. `--topbar-h` becomes `0px` while it is off.
Start every new app from [`_template/index.html`](_template/index.html).
Then use the tokens (`var(--bg)`, `var(--accent)` …) and the ready classes:
`.wrap` `.title` `.sub` `.card` `.btn` `.btn-primary` `.seg` `.input` `.back` `.note` `.muted`.

Offline apps (with their own service worker, like Reader) may copy the token values
into their own CSS instead of linking — but the values must match `theme.css`.

## The rules
1. **Colors** — near-white page `#fafafa`, white surfaces, soft grey `#efefef`, black text `#111`, grey secondary text `#757575`.
   **One accent only: blue `#3366ee`**, used for the single main action on a screen. **Always light** — pages declare `color-scheme: only light`, so a phone in dark mode does not darken them.
2. **Font** — the phone's own system font (Roboto on Android). Regular weight (400–500). No bold headings.
   Body 17px, labels 14px, page title 22px.
3. **Space** — 8-point scale: 8 / 16 / 24 / 32 / 48. When unsure, add more space, not less.
4. **Shape** — pills (`999px`) for buttons and switches, 24px corners for cards, 16px for inputs.
5. **No hard borders.** Separate things with space, soft grey fills, or a very soft shadow.
6. **Few things per screen.** One title, one short line of help, then the content.
7. **Icons** — soft grey rounded tile, black shapes, at most one blue shape. Drawn as inline SVG.
8. **Every app loads `/topbar.js`.** The bar is the way home — no separate "← All apps" link.
9. **One app, not many.** Apps link `/manifest.json` (the hub's). No app has its own manifest, so the phone installs only "dhvl1992".
10. **No third-party scripts** (no CDNs, ads, analytics). All apps share this website, so any script could read your MyBrain login.
    Copy libraries into the repo instead (like `mybrain/vendor/`).
11. **Offline apps** (with a caching service worker) must also cache `/theme.css`, `/topbar.js` and `/apps.js`.

## Adding a new app
1. Make its own repo, turn on GitHub Pages (Settings → Pages → `main` / root).
2. Copy `_template/index.html` from this repo as its starting page (theme, manifest and top bar already linked).
3. Add one line to `HUB.apps` in this repo's `apps.js` (+ an icon in `HUB.icons`). It then shows on the home page AND in the top bar.
