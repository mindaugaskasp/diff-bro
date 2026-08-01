#!/usr/bin/env node
// Guards the surface-role contract (tokens.css): a theme is a LAYER ORDER, not a
// bag of greys, and every theme must keep those layers legible and distinct so
// none can quietly go flat the way the old light theme did. This is the
// mechanical backstop behind that discipline — run by `npm run check`.
//
// For every theme in themes.css it resolves the palette (following var() and
// color-mix), then asserts:
//   * TEXT legibility — body/dim text clears WCAG contrast on both surfaces.
//   * SURFACE separation — the app ground and a raised card are distinguishable
//     (so cards float, never blend), and base vs chrome differ at all.
//   * BORDER delineation — the divider is visible against the chrome it edges.
// Thresholds are floors calibrated to the shipping themes; raise them as the
// palettes improve, never lower them to make a flat theme pass.
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tokensCss = readFileSync(join(root, 'src/renderer/src/styles/tokens.css'), 'utf8')
const themesCss = readFileSync(join(root, 'src/renderer/src/styles/themes.css'), 'utf8')

// --- tiny colour maths (sRGB, WCAG) ---------------------------------------
const clamp = (n) => Math.max(0, Math.min(255, n))
function parseHex(h) {
  let s = h.replace('#', '').trim()
  if (s.length === 3)
    s = s
      .split('')
      .map((c) => c + c)
      .join('')
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
}
const chan = (c) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

// --- parse `selector { --k: v; }` blocks -----------------------------------
function blocks(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '') // strip comments (they hold --token: text)
  const out = {}
  const re = /(:root(?:\[data-theme='[a-z]+'\])?)\s*\{([^}]*)\}/g
  let m
  while ((m = re.exec(css))) {
    const map = (out[m[1]] ??= {})
    const body = m[2]
    const kv = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi
    let d
    while ((d = kv.exec(body))) map[d[1].trim()] = d[2].trim()
  }
  return out
}
const tokenBlocks = blocks(tokensCss)
const themeBlocks = blocks(themesCss)
const structuralDefaults = tokenBlocks[':root'] || {}

const THEMES = [
  'light',
  'dark',
  'solar',
  'neon',
  'nord',
  'sepia',
  'dim',
  'beacon',
  'meridian',
  'linen',
  'bloom',
  'nyan',
  'matrix',
  'contrast'
]

// Effective token map for a theme: structural defaults (tokens.css) < the light
// palette on the bare :root < the theme's own overrides. Light additionally
// layers its [data-theme='light'] surface-role block.
function mapFor(theme) {
  let map = { ...structuralDefaults, ...(themeBlocks[':root'] || {}) }
  if (theme !== 'light') map = { ...map, ...(themeBlocks[`:root[data-theme='${theme}']`] || {}) }
  else map = { ...map, ...(themeBlocks[":root[data-theme='light']"] || {}) }
  return map
}

// Resolve a token to an [r,g,b], following var() and one color-mix(in srgb …).
function resolve(name, map, seen = new Set()) {
  if (seen.has(name)) throw new Error(`cycle at ${name}`)
  seen.add(name)
  const v = map[name]
  if (v == null) throw new Error(`missing ${name}`)
  return evalColor(v, map, seen)
}
function evalColor(v, map, seen) {
  v = v.trim()
  if (v.startsWith('#')) return parseHex(v)
  const varM = v.match(/^var\((--[a-z0-9-]+)\)$/i)
  if (varM) return resolve(varM[1], map, new Set(seen))
  const mixM = v.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+)%\s*,\s*(.+?)\)$/i)
  if (mixM) {
    const a = evalColor(mixM[1], map, seen)
    const b = evalColor(mixM[3], map, seen)
    const p = Number(mixM[2]) / 100
    return a.map((ch, i) => clamp(Math.round(ch * p + b[i] * (1 - p))))
  }
  throw new Error(`cannot evaluate "${v}"`)
}

// --- the contract ----------------------------------------------------------
const RULES = [
  { key: 'text/bg', a: 'text', b: 'bg', min: 4.5, kind: 'text' },
  { key: 'text/panel', a: 'text', b: 'bg-panel', min: 4.5, kind: 'text' },
  { key: 'dim/panel', a: 'text-dim', b: 'bg-panel', min: 3.0, kind: 'text' },
  { key: 'onAccent/accent', a: 'text-on-accent', b: 'accent', min: 3.0, kind: 'text' },
  // Surfaces: the raised card must lift off the canvas, chrome off the base.
  { key: 'raised/canvas', a: 'bg-raised', b: 'bg-canvas', min: 1.04, kind: 'surface' },
  { key: 'panel/bg', a: 'bg-panel', b: 'bg', min: 1.03, kind: 'surface' },
  // The divider must be visible against the chrome it edges.
  { key: 'border/panel', a: 'border', b: 'bg-panel', min: 1.11, kind: 'border' }
]
const tok = (n) => `--${n}`

const rows = []
const failures = []
for (const theme of THEMES) {
  const map = mapFor(theme)
  const cells = {}
  for (const r of RULES) {
    let ratio
    try {
      ratio = contrast(resolve(tok(r.a), map), resolve(tok(r.b), map))
    } catch (e) {
      failures.push(`${theme}: ${r.key} — ${e.message}`)
      cells[r.key] = 'ERR'
      continue
    }
    cells[r.key] = ratio
    if (ratio < r.min)
      failures.push(`${theme}: ${r.key} ${ratio.toFixed(2)} < ${r.min} (${r.kind})`)
  }
  rows.push({ theme, cells })
}

// --- report ----------------------------------------------------------------
const cols = RULES.map((r) => r.key)
const pad = (s, n) => String(s).padEnd(n)
const w = Math.max(...cols.map((c) => c.length), 6)
console.log('\nTheme surface-depth report (contrast ratios):\n')
console.log(pad('theme', 9) + cols.map((c) => pad(c, w + 1)).join(''))
for (const { theme, cells } of rows) {
  const line = cols.map((c) =>
    pad(typeof cells[c] === 'number' ? cells[c].toFixed(2) : cells[c], w + 1)
  )
  console.log(pad(theme, 9) + line.join(''))
}
console.log('\nfloors:    ' + RULES.map((r) => pad(r.min, w + 1)).join(''))

// --- tag ink ---------------------------------------------------------------
// Tag colours are the one palette that does NOT come from tokens (a user picks
// them), and they are tuned for dark grounds — raw, they sit at ~1.2 against a
// light theme's surface and vanish. ui.css re-lightens them per ground in OKLCH,
// keeping the picked hue and chroma so a green still reads green. This checks
// the result still registers as a UI element on every theme; the palette and the
// per-theme lightness are read from source so neither can drift from the floor.
const TAG_INK_MIN = 3.0
const uiCss = readFileSync(join(root, 'src/renderer/src/styles/ui.css'), 'utf8')
const storeJs = readFileSync(join(root, 'src/renderer/src/stores/snippetStore.js'), 'utf8')
const inkL = uiCss.match(/--tag-ink:\s*oklch\(from .+?\s+var\((--[a-z-]+)\)\s+c\s+h\)/)
if (!inkL) failures.push('ui.css: no --tag-ink oklch(from …) to check')
const palette = [...storeJs.matchAll(/'(#[0-9a-f]{6})'/gi)].map((m) => m[1])
if (palette.length < 5) failures.push('snippetStore.js: no tag palette to check')

// --- OKLab (Björn Ottosson) ------------------------------------------------
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
function srgbToOklab([r, g, b]) {
  const [R, G, B] = [r, g, b].map((c) => toLinear(c / 255))
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}
function oklabToSrgb([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ].map((c) => toGamma(c) * 255)
}
const inGamut = (rgb) => rgb.every((c) => c >= -0.5 && c <= 255.5)
// Set lightness, keep hue and chroma — reducing chroma if that puts the colour
// out of sRGB, which is what CSS Color 4 gamut mapping does.
function relight(hex, L) {
  const [, A, B] = srgbToOklab(parseHex(hex))
  const C = Math.hypot(A, B)
  const H = Math.atan2(B, A)
  const at = (c) => oklabToSrgb([L, c * Math.cos(H), c * Math.sin(H)])
  const fit = () => {
    if (inGamut(at(C))) return C
    let lo = 0
    let hi = C
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(at(mid))) lo = mid
      else hi = mid
    }
    return lo
  }
  return at(fit()).map((c) => clamp(Math.round(c)))
}

// Every surface a chip can sit on, paired with its theme's ink lightness.
function tagSurfaces(lToken) {
  const out = []
  for (const theme of THEMES) {
    const map = mapFor(theme)
    const L = Number(map[lToken])
    for (const ground of ['--bg', '--bg-panel', '--bg-elevated']) {
      out.push({ theme, ground, L, surface: resolve(ground, map) })
    }
  }
  return out
}

function checkTagInk(lToken) {
  let worst = { ratio: Infinity }
  for (const { theme, ground, L, surface } of tagSurfaces(lToken)) {
    if (!Number.isFinite(L)) {
      failures.push(`${theme}: ${lToken} is not a number (tag-ink)`)
      continue
    }
    for (const hex of palette) {
      const ratio = contrast(relight(hex, L), surface)
      if (ratio < worst.ratio) worst = { ratio, theme, ground, hex }
      if (ratio < TAG_INK_MIN)
        failures.push(
          `${theme}: tag ${hex} on ${ground} inks to ${ratio.toFixed(2)} < ${TAG_INK_MIN} (tag-ink)`
        )
    }
  }
  return worst
}

if (inkL && palette.length >= 5) {
  const worst = checkTagInk(inkL[1])
  console.log(
    `tag ink (OKLCH lightness ${inkL[1]}): worst ${worst.ratio.toFixed(2)} — ` +
      `${worst.theme} ${worst.hex} on ${worst.ground}, floor ${TAG_INK_MIN}\n`
  )
}

if (failures.length) {
  console.error(
    `\n✗ theme depth: ${failures.length} violation(s) — a theme must keep its layers legible and distinct:\n`
  )
  for (const f of failures) console.error('  ' + f)
  console.error('\nFix the palette (surface roles in tokens.css); do not lower the floors.\n')
  process.exit(1)
}
console.log(`\n✓ theme depth ok (${THEMES.length} themes)\n`)
