# Instructions for Claude

This repo is the hub ("My Apps") for Dhaval's personal web apps. Each app lives in its own repo and is served at `dhvl1992.github.io/<repo>/`.

- **Design:** every app in this project must follow `DESIGN.md` and use `theme.css`. Read DESIGN.md before building or restyling any app.
- **Name:** the product is called **dhvl1992**. All apps should feel like parts of this ONE app.
- **Every app** links `/theme.css` + `/manifest.json` and loads `/topbar.js` (see DESIGN.md). Start new apps from `_template/index.html`.
- **Adding an app:** add one entry to `HUB.apps` (and an icon to `HUB.icons`) in `apps.js` — home grid and top bar both read it.
- **Shared files** (`theme.css`, `topbar.js`, `apps.js`) affect every app: test the hub AND each app before pushing.
- Keep apps simple: plain HTML/CSS/JS, no build step, free services only.
- Explain in simple English, one step at a time.
