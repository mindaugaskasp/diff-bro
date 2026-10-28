# design/

Canvas work only. Nothing here ships in the app, and app code never imports from it.

## components/: the canvas kit

Mockups for a design canvas are built from these files, never drawn from scratch, so a proposal looks like the app it changes.

| file | what it is |
|---|---|
| `app.css` | The app's real tokens, all 20 themes, `ui.css` and the rail, search, section header, row and tab styles, unscoped. **Generated; do not edit.** |
| `Rail.dc.html` | Sidebar rail: Home, Diffs, Snippets, Tools, Keys. Count badges and a pending ✦ count. |
| `SearchField.dc.html` | The sidebar search box. |
| `SectionHead.dc.html` | A sidebar section header: title, count and actions. |
| `SnippetRow.dc.html` | A library row: monogram, name, meta, NEW, star. Can be indented. |
| `TabStrip.dc.html` | The tab strip and its **+** button. |
| `Notice.dc.html` | The top-centre notice, with an optional Undo. |

Every component takes a `theme` tweak with all 20 themes, and wraps itself in `.dk` so `app.css` applies its theme there.

**Using it on a canvas:**
1. Copy `app.css` and the components you need into the canvas's `project/` folder.
2. Link `app.css` after the `support.js` line.
3. Mount a component with `<dc-import name="SnippetRow" …>`, or copy its markup.
4. Use the app's own classes (`.btn`, `.btn-primary`, `.glyph-well`, `.tile`…) for anything else.

**Keeping it true:**
- After any change to `src/renderer/src/styles/` or a component's CSS, regenerate:
  `docker compose exec -T node sh -c 'node scripts/build-design-kit.mjs'`
- When a canvas needs a part the kit doesn't have, add it here first, copying the real markup and class names from the live DOM. Then use it.

## render/: approval on the real app

The last step of grilling, before an Approved design page is signed off, renders the chosen design on the **live app**:
- seed realistic data;
- drive each state through the real UI;
- draw the redesign over the app's own components with `kit.mjs`;
- screenshot it in light and dark.

The screenshots are what the Approved design page shows.

| file | what it is |
|---|---|
| `kit.mjs` | Page-side helpers, installed with `page.evaluate(installKit)`: `row`, `tagHead`, `railPending`, `proposedTab`, `reviewBar`, `notice`, `tagChip`, `dropdown`, `designFont`, `keepTabs`. |
| `<issue>-<slug>.render.mjs` | One render per design, with its states. `121-proposals.render.mjs` is the worked example. |
| `playwright.config.mjs` | Runs only the `*.render.mjs` files. |

Run a render in the Docker env:
`docker compose exec -T node sh -c 'npm run build && npx playwright test -c design/render/playwright.config.mjs'`

Screenshots land in `design/render/out/<issue>/` (git-ignored). Upload them to the canvas.
