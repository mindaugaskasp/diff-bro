# Themes — backlog

Theme concepts to implement later. Design pitch (with live mockups):
https://claude.ai/code/artifact/7228542b-2337-4506-b3b4-aeeb957b3db1

## How to add a theme (for each below)

1. Add a `:root[data-theme='<id>']` block to `src/renderer/src/styles/themes.css`
   redefining **every** palette token — nothing structural, so alignment/sizing
   stay identical across themes.
2. Register it in `src/renderer/src/utils/themes.js` (`THEMES` array) with a
   `swatch: { bg, accent, add, del }` for the Settings → Appearance preview.
3. Verify in **both** the diff view and the empty state, in the Docker env.
4. Monaco/Mermaid ground keys off `isDarkTheme(id)` — add the id there if it's a
   dark theme.

Palette token names: `--bg --bg-panel --bg-hover --border --text --text-dim
--text-hint --accent --warning-bg/border/text --danger-bg/border/text
--success-text --favorite --text-on-accent`.

---

## Useful (ship-quality — pure token swaps)

### Nord `id: nord` (dark)
Calm arctic palette, easy on the eyes for long sessions.
- bg `#2e3440` · panel `#3b4252` · hover `#434c5e` · border `#4c566a`
- text `#eceff4` · dim `#9aa5b8` · accent `#88c0d0`
- success/add `#a3be8c` · danger/del `#bf616a` · favorite `#ebcb8b`
- `isDarkTheme` → true.

### Sepia Paper `id: sepia` (light)
Warm low-glare "e-reader" theme; great for prose/contracts.
- bg `#f4ecd8` · panel `#eadfc6` · hover `#e2d4b4` · border `#d5c4a0`
- text `#463a28` · dim `#8a7a5c` · accent `#9a5b2c`
- success/add `#4b7a3a` · danger/del `#a5442f` · favorite `#b8860b`

---

## Retro (need a small per-skin extension beyond tokens)

### Windows 98 `id: win98` (light)
Teal desktop, silver bevelled panels, navy title-bar gradient.
- bg `#008080` · panel `#c0c0c0` · hover `#d4d0c8` · border `#808080`
- text `#000000` · dim `#404040` · accent `#000080`
- success/add `#008000` · danger/del `#800000` · text-on-accent `#ffffff`
- **Extra:** bevel treatment (raised `#dfdfdf` top-left / `#808080` bottom-right)
  on panels + buttons; square corners (radius 0); Tahoma/MS-Sans font stack.
  Gate the bevels behind a `[data-theme='win98']` skin block so base components
  are untouched.

### Mac Platinum `id: platinum` (light)
System 7/8 grayscale, pinstripe chrome, near-monochrome.
- bg `#b8b8b8` · panel `#dcdcdc` · hover `#cfcfcf` · border `#808080`
- text `#101010` · dim `#555555` · accent `#303030`
- success/add `#2f7d4f` · danger/del `#b23a3a`
- **Extra:** pinstripe background (`repeating-linear-gradient`) on title bands;
  Charcoal/Geneva font stack.

---

## Novelty (opt-in, more work)

### Phosphor CRT `id: crt` (dark)
Black ground, green phosphor text, faint scanlines + glow.
- bg `#050805` · panel `#0b120b` · hover `#10200f` · border `#154a15`
- text `#33ff66` · dim `#1f9a3f` · accent `#7dffa0`
- success/add `#b6ff00` · danger/del `#ff5f5f`
- **Extra:** a scanline overlay (`::after` repeating-linear-gradient, low
  opacity) + `text-shadow` glow. Keep the overlay subtle (readability). Respect
  `prefers-reduced-motion` if any flicker is added. `isDarkTheme` → true.

### Nyan `id: nyan` (dark) — **make it USEFUL but a bit distracting**
Per feedback: NOT the unusable full-screen scrolling-rainbow-puke from the pitch.
Keep a **readable base** so diffing actually works, and confine the chaos to
non-content chrome:
- **Readable dark base:** bg `#160a20` · panel `#231033` · hover `#2e1642`
  · border `#5a2b7a` · text `#f4e9ff` · dim `#b79fcf`.
- **Playful accents:** accent `#ff2ecb` (hot pink) · success/add `#63ff4d`
  (lime) · danger/del `#ff5470`.
- **Where the fun lives (distracting-but-usable):** an animated rainbow accent
  stripe on the toolbar band, and the Nyan cat + rainbow **only in the empty
  state** (the `SupportedFormats` / "drop two files" area) — never over the diff
  panes, so content stays legible.
- **Extra:** the Nyan cat (inline SVG) + rainbow trail keyframes from the pitch,
  scoped to `[data-theme='nyan'] .empty`; MUST honor `prefers-reduced-motion`
  (park the cat, freeze the rainbow). `isDarkTheme` → true.

---

## Suggested order

1. **Nord**, **Sepia** — pure token swaps, immediate value.
2. **Win98**, **Platinum** — add the shared per-skin bevel/pinstripe mechanism.
3. **CRT**, **Nyan** — the overlay + animation layer (and a stern review for Nyan).
