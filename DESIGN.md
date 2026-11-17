# My Apps — Design rules

Every app in this project follows ONE look: minimal, quiet, easy on the eyes.
The values live in [`theme.css`](theme.css). Do not invent new colors, fonts or sizes in an app.

## How an app uses it
```html
<link rel="stylesheet" href="/theme.css">
```
Then use the tokens (`var(--bg)`, `var(--accent)` …) and the ready classes:
`.wrap` `.title` `.sub` `.card` `.btn` `.btn-primary` `.seg` `.input` `.back` `.note` `.muted`.

Offline apps (with their own service worker, like Reader) may copy the token values
into their own CSS instead of linking — but the values must match `theme.css`.

## The rules
1. **Colors** — near-white page `#fafafa`, white surfaces, soft grey `#efefef`, black text `#111`, grey secondary text `#757575`.
   **One accent only: blue `#3366ee`**, used for the single main action on a screen. Dark mode is automatic.
2. **Font** — the phone's own system font (Roboto on Android). Regular weight (400–500). No bold headings.
   Body 17px, labels 14px, page title 22px.
3. **Space** — 8-point scale: 8 / 16 / 24 / 32 / 48. When unsure, add more space, not less.
4. **Shape** — pills (`999px`) for buttons and switches, 24px corners for cards, 16px for inputs.
5. **No hard borders.** Separate things with space, soft grey fills, or a very soft shadow.
6. **Few things per screen.** One title, one short line of help, then the content.
7. **Icons** — soft grey rounded tile, black shapes, at most one blue shape. Drawn as inline SVG.
8. **Every app has a "← All apps" link** (`<a class="back" href="/">`) at the top.

## Adding a new app
1. Make its own repo, turn on GitHub Pages (Settings → Pages → `main` / root).
2. Link `/theme.css`, follow the rules above.
3. Add one line to the `APPS` list in this repo's `index.html` (+ an icon in `ICONS`).
