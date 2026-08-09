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
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { featureStyleDirs } from './lib/featureDirs.mjs'
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
  'contrast',
  'volcano'
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

// Resolve a token to an [r,g,b], or [r,g,b,a] when it is a veil (the ink at low
// alpha over transparent) — alpha has to survive to be painted, not flattened.
function resolve(name, map, seen = new Set()) {
  if (seen.has(name)) throw new Error(`cycle at ${name}`)
  seen.add(name)
  const v = map[name]
  if (v == null) throw new Error(`missing ${name}`)
  return evalColor(v, map, seen)
}
const alphaOf = (c) => (c.length > 3 ? c[3] : 1)
function evalColor(v, map, seen) {
  v = v.trim()
  if (v === 'transparent') return [0, 0, 0, 0]
  if (v.startsWith('#')) return parseHex(v)
  const varM = v.match(/^var\((--[a-z0-9-]+)\)$/i)
  if (varM) return resolve(varM[1], map, new Set(seen))
  const mixM = v.match(/^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\)$/i)
  if (mixM) {
    const a = evalColor(mixM[1], map, seen)
    const b = evalColor(mixM[3], map, seen)
    const p = Number(mixM[2]) / 100
    // Premultiplied, per CSS color-mix; two opaque colours reduce to a plain mix.
    const [aa, ba] = [alphaOf(a), alphaOf(b)]
    const alpha = aa * p + ba * (1 - p)
    if (alpha === 0) return [0, 0, 0, 0]
    const rgb = [0, 1, 2].map((i) =>
      clamp(Math.round((a[i] * aa * p + b[i] * ba * (1 - p)) / alpha))
    )
    return alpha === 1 ? rgb : [...rgb, alpha]
  }
  throw new Error(`cannot evaluate "${v}"`)
}
function over(fg, bg) {
  const a = alphaOf(fg)
  return a === 1
    ? fg.slice(0, 3)
    : [0, 1, 2].map((i) => clamp(Math.round(fg[i] * a + bg[i] * (1 - a))))
}

// --- the contract ----------------------------------------------------------
const RULES = [
  { key: 'text/bg', a: 'text', b: 'bg', min: 4.5, kind: 'text' },
  { key: 'text/panel', a: 'text', b: 'bg-panel', min: 4.5, kind: 'text' },
  { key: 'dim/panel', a: 'text-dim', b: 'bg-panel', min: 3.0, kind: 'text' },
  // 4.5, not the non-text 3.0 it used to carry: this pair IS a button label
  // (.btn-primary, every `.on` chip), 11.5px at weight 600, which is not large
  // text by WCAG. The component-pair pass below already held it to 4.5, so the
  // two disagreed and 41 entries sat in the baseline because of it.
  { key: 'onAccent/accent', a: 'text-on-accent', b: 'accent', min: 4.5, kind: 'text' },
  // Surfaces: the raised card must lift off the canvas, chrome off the base.
  { key: 'raised/canvas', a: 'bg-raised', b: 'bg-canvas', min: 1.04, kind: 'surface' },
  { key: 'panel/bg', a: 'bg-panel', b: 'bg', min: 1.03, kind: 'surface' },
  // The divider must be visible against the chrome it edges.
  { key: 'border/panel', a: 'border', b: 'bg-panel', min: 1.11, kind: 'border' },
  // A control must read as a control BEFORE it is touched: the toolbar shipped
  // with a 1.00 resting fill and dim ink — what :disabled looks like — because
  // nothing measured the affordance.
  { key: 'btn-face/panel', a: 'btn-face', b: 'bg-panel', min: 1.25, kind: 'control' },
  { key: 'btn-label/face', a: 'text', b: 'btn-face', min: 4.5, kind: 'text' },
  { key: 'btn-edge/panel', a: 'btn-edge', b: 'bg-panel', min: 3.0, kind: 'control' },
  // A pinned row marks itself with a bar and a filled star, both non-text marks
  // on the chrome. Raw --favorite is a gold tuned to read on the dark grounds
  // and scores 2.23–3.00 on light/solar/sepia/bloom, so this shipped below the
  // non-text floor in four themes with nothing measuring it.
  { key: 'pin-ink/panel', a: 'pin-ink', b: 'bg-panel', min: 3.0, kind: 'control' },
  // The primary's hover keyline against its own fill. Not the 3.0 non-text
  // floor — that is for a boundary at REST, and no 1px rim mixed from the
  // accent reaches it on every theme. The bar is the neutral .btn's own shipped
  // hover step (1.16 at worst, on sepia): a primary must move at least as
  // visibly as the quiet button beside it. Nothing measured this before, and
  // the first rewrite of the hover shipped at 1.04 on matrix because of it.
  { key: 'pri-edge/accent', a: 'btn-primary-edge', b: 'accent', min: 1.5, kind: 'control' },
  // The diff bands against the editor ground. The bar is MONACO'S OWN, which is
  // what shipped on all fourteen themes before the app defined a theme at all:
  // its weakest band is 1.15 (the light added row on white). A band that reads
  // less clearly than the stock one nobody chose would be a regression.
  { key: 'add-line/bg', a: 'diff-add-line', b: 'bg', min: 1.2, kind: 'surface' },
  { key: 'del-line/bg', a: 'diff-del-line', b: 'bg', min: 1.2, kind: 'surface' },
  // …and the text still has to be readable ON the band, which is where a tint
  // chosen only for visibility goes wrong.
  { key: 'text/add-line', a: 'text', b: 'diff-add-line', min: 4.5, kind: 'text' },
  { key: 'text/del-line', a: 'text', b: 'diff-del-line', min: 4.5, kind: 'text' }
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
      // A veil is only a colour once painted, so both sides land on the chrome.
      const ground = resolve('--bg-panel', map)
      ratio = contrast(over(resolve(tok(r.a), map), ground), over(resolve(tok(r.b), map), ground))
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
const TAG_LABEL_MIN = 4.5
const uiCss = readFileSync(join(root, 'src/renderer/src/styles/ui.css'), 'utf8')
const paletteJs = readFileSync(join(root, 'src/renderer/src/utils/snippetState.js'), 'utf8')
const inkL = uiCss.match(/--tag-ink:\s*oklch\(from .+?\s+var\((--[a-z-]+)\)\s+c\s+h\)/)
if (!inkL) failures.push('ui.css: no --tag-ink oklch(from …) to check')
const palette = [...paletteJs.matchAll(/'(#[0-9a-f]{6})'/gi)].map((m) => m[1])
if (palette.length < 5) failures.push('snippetState.js: no tag palette to check')

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

// A picked chip is the ink filled with a --bg label; hovering inverts it to an
// ink label on --bg. Both are TEXT on the same pair, so it carries the 4.5 floor.
function checkTagLabel(lToken) {
  let worst = { ratio: Infinity }
  for (const theme of THEMES) {
    const map = mapFor(theme)
    const L = Number(map[lToken])
    const ground = resolve('--bg', map)
    for (const hex of palette) {
      const ratio = contrast(relight(hex, L), ground)
      if (ratio < worst.ratio) worst = { ratio, theme, hex }
      if (ratio < TAG_LABEL_MIN)
        failures.push(
          `${theme}: tag ${hex} label/fill against --bg is ${ratio.toFixed(2)} < ${TAG_LABEL_MIN} (tag-label)`
        )
    }
  }
  return worst
}

if (inkL && palette.length >= 5) {
  const worst = checkTagInk(inkL[1])
  console.log(
    `tag ink (OKLCH lightness ${inkL[1]}): worst ${worst.ratio.toFixed(2)} — ` +
      `${worst.theme} ${worst.hex} on ${worst.ground}, floor ${TAG_INK_MIN}`
  )
  const label = checkTagLabel(inkL[1])
  console.log(
    `tag label (picked fill / hover invert): worst ${label.ratio.toFixed(2)} — ` +
      `${label.theme} ${label.hex}, floor ${TAG_LABEL_MIN}\n`
  )
}

// --- diagram-diff status colours -------------------------------------------
// Two floors, because the statuses have two jobs: each must be legible on the
// viewer's card (3:1, the non-text floor — these are strokes and badges, not
// body text), and each must be TELLABLE APART from the other two. Contrast
// alone does not give the second: on matrix --accent and --success-text are the
// same colour, so an accent-tinted "changed" would score fine and still be
// indistinguishable from "added".
const DG_MIN = 3.0
const DG_DELTA_E = 0.1
const DG_KEYS = ['--dg-add', '--dg-del', '--dg-chg']

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
function oklab([r, g, b]) {
  const [R, G, B] = [r, g, b].map((x) => srgbToLinear(x / 255))
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}
const deltaE = (a, b) => {
  const [A, B] = [oklab(a), oklab(b)]
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

function pairsOf(keys) {
  const out = []
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) out.push([keys[i], keys[j]])
  return out
}

let dgWorst = { ratio: Infinity }
let dgWorstPair = { de: Infinity }
for (const theme of THEMES) {
  const map = mapFor(theme)
  let card
  try {
    card = resolve('--bg-raised', map)
  } catch {
    continue
  }
  const got = {}
  for (const key of DG_KEYS) {
    try {
      got[key] = resolve(key, map)
    } catch (e) {
      failures.push(`${theme}: ${key} — ${e.message}`)
    }
  }
  for (const [key, rgb] of Object.entries(got)) {
    const ratio = contrast(rgb, card)
    if (ratio < dgWorst.ratio) dgWorst = { ratio, theme, key }
    if (ratio < DG_MIN) {
      failures.push(`${theme}: ${key} ${ratio.toFixed(2)} < ${DG_MIN} on --bg-raised`)
    }
  }
  for (const [x, y] of pairsOf(Object.keys(got))) {
    const de = deltaE(got[x], got[y])
    if (de < dgWorstPair.de) dgWorstPair = { de, theme, pair: `${x}/${y}` }
    if (de < DG_DELTA_E) {
      failures.push(
        `${theme}: ${x} and ${y} are OKLab ${de.toFixed(3)} apart ` +
          `(< ${DG_DELTA_E}) — two statuses would read as one`
      )
    }
  }
}
if (Number.isFinite(dgWorst.ratio)) {
  console.log(
    `diagram status: worst contrast ${dgWorst.ratio.toFixed(2)} — ${dgWorst.theme} ` +
      `${dgWorst.key}, floor ${DG_MIN}`
  )
  console.log(
    `diagram status: closest pair ΔE ${dgWorstPair.de.toFixed(3)} — ${dgWorstPair.theme} ` +
      `${dgWorstPair.pair}, floor ${DG_DELTA_E}\n`
  )
}

// --- component colour/ground pairs -----------------------------------------
// The gap this closes: the checks above audit the tokens against the surface
// ROLES, which says nothing about a component that pairs a token with a ground
// of its own choosing. Three real bugs shipped through that hole — a status
// stroke used as body text (2.14 on light), --text-dim on an elevated band
// (2.82 on sepia), and a chrome role behind a semantic notice.
//
// Only same-rule pairs are checked, because that is the subset CSS can answer
// on its own: when one rule sets BOTH color and background, the ground is not a
// guess. A `color` whose ground comes from an ancestor is skipped and counted,
// so the limit of this check is visible rather than implied.
const TEXT_MIN = 4.5
// WCAG large text: >= 24px, or >= 18.66px when bold.
const LARGE_MIN = 3.0
const BG_PROPS = ['background-color', 'background']
const SKIP_VALUE = /^(inherit|currentcolor|initial|unset|revert|none|transparent)$/i

// Comments are stripped first: prose contains colons, and "does not measure:
// even at 40% …" parses as a declaration whose value swallows the real one after
// it — that silently skipped the very rule this check was written for.
function rulesIn(name, css) {
  const out = []
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = Object.fromEntries(
      [...m[2].matchAll(/([a-z-]+)\s*:\s*([^;]+);/gi)].map((d) => [d[1].toLowerCase(), d[2].trim()])
    )
    const bg = BG_PROPS.map((k) => decls[k]).find(Boolean)
    if (!decls.color || !bg) continue
    out.push({
      where: `${name} ${m[1].trim().split('\n').pop().trim()}`,
      color: decls.color,
      bg,
      fontSize: decls['font-size'],
      weight: decls['font-weight']
    })
  }
  return out
}

// tokens/themes DEFINE the palette; the passes above audit those.
const isAudited = (name) => name.endsWith('.css') && name !== 'tokens.css' && name !== 'themes.css'

function componentRules() {
  const dirs = [
    'src/renderer/src/components/styles',
    'src/renderer/src/styles',
    ...featureStyleDirs()
  ]
  const out = []
  for (const dir of dirs) {
    let names
    try {
      names = readdirSync(join(root, dir))
    } catch {
      continue
    }
    for (const name of names.filter(isAudited)) {
      out.push(...rulesIn(name, readFileSync(join(root, dir, name), 'utf8')))
    }
  }
  return out
}

// A token font-size resolves through tokens.css, so the ramp is read rather
// than assumed; anything unreadable is treated as body text, the stricter floor.
function pxOf(value, map) {
  if (!value) return null
  const varM = value.match(/^var\((--[a-z0-9-]+)\)$/i)
  const raw = varM ? map[varM[1]] : value
  const px = String(raw ?? '').match(/^([\d.]+)px$/)
  return px ? Number(px[1]) : null
}

// Pairs already below the floor when this check was introduced. A ratchet in
// BOTH directions, like legacySize.mjs and structure-baseline.json: a listed
// pair may only get better, a new one must clear the floor outright, and a
// pair that now CLEARS its floor fails until its line is deleted — an entry
// nobody has to remove is how an allowlist becomes permanent permission. The
// alternative on day one was 168 failures, which would have meant either a
// cleanup nobody asked for or a floor quietly set to whatever passed.
const baselinePath = join(root, 'scripts/theme-pair-baseline.json')
const BASELINE = new Map(
  JSON.parse(readFileSync(baselinePath, 'utf8')).map((e) => [
    `${e.theme}|${e.where}`,
    e.ratio
  ])
)

const pairs = componentRules()
let pairWorst = { ratio: Infinity }
let skipped = 0
let baselined = 0
// Every pair this run actually judged, so a baseline line that no longer
// describes a real below-floor pair can be told from one that does.
const measured = new Set()
const held = new Set()

// One pair, one theme: the verdict, so the loop below stays a loop.
function judgePair(rule, theme) {
  const map = mapFor(theme)
  let fg, bg
  try {
    fg = evalColor(rule.color, map, new Set())
    bg = evalColor(rule.bg, map, new Set())
  } catch {
    return { skip: true }
  }
  // A translucent ground is painted over something this check cannot see.
  if (alphaOf(bg) !== 1) return { skip: true }
  const size = pxOf(rule.fontSize, map)
  const bold = Number(rule.weight) >= 700
  const min = size && (size >= 24 || (size >= 18.66 && bold)) ? LARGE_MIN : TEXT_MIN
  return { ratio: contrast(over(fg, bg), bg), min }
}

for (const rule of pairs) {
  if (SKIP_VALUE.test(rule.color) || SKIP_VALUE.test(rule.bg)) {
    skipped++
    continue
  }
  for (const theme of THEMES) {
    const { skip, ratio, min } = judgePair(rule, theme)
    if (skip) {
      skipped++
      break
    }
    if (ratio < pairWorst.ratio) pairWorst = { ratio, theme, where: rule.where, min }
    const key = `${theme}|${rule.where}`
    measured.add(key)
    if (ratio >= min) continue
    const known = BASELINE.get(key)
    if (known === undefined) {
      failures.push(
        `${theme}: ${rule.where} — text ${ratio.toFixed(2)} < ${min} on its own background`
      )
    } else if (ratio < known - 0.01) {
      failures.push(
        `${theme}: ${rule.where} — text ${ratio.toFixed(2)} is WORSE than its baseline ` +
          `${known.toFixed(2)}; the ratchet only turns one way`
      )
    } else {
      baselined++
      held.add(key)
    }
  }
}

// A line that no longer holds anything back. Either the pair now clears its
// floor, or the rule it names is gone — both mean the entry is permission
// nobody is using, and permission nobody is using is how 155 of these
// accumulated. `--prune` rewrites the file rather than making you find them.
const stale = [...BASELINE.keys()].filter((key) => !held.has(key))
if (stale.length) {
  const [passing, vanished] = [
    stale.filter((k) => measured.has(k)),
    stale.filter((k) => !measured.has(k))
  ]
  if (process.argv.includes('--prune')) {
    const kept = JSON.parse(readFileSync(baselinePath, 'utf8')).filter((e) =>
      held.has(`${e.theme}|${e.where}`)
    )
    writeFileSync(baselinePath, `${JSON.stringify(kept, null, 2)}\n`)
    console.log(`pruned ${stale.length} stale baseline entries — ${kept.length} remain\n`)
  } else {
    failures.push(
      ...passing.map((k) => `${k.replace('|', ': ')} — now CLEARS its floor; delete its baseline line`),
      ...vanished.map((k) => `${k.replace('|', ': ')} — baselined pair no longer exists; delete its line`)
    )
  }
}
if (Number.isFinite(pairWorst.ratio)) {
  console.log(
    `component pairs: ${pairs.length} rules set colour AND background; worst ` +
      `${pairWorst.ratio.toFixed(2)} — ${pairWorst.theme} ${pairWorst.where}, ` +
      `floor ${pairWorst.min}`
  )
  console.log(
    `component pairs: ${skipped} skipped (ground not decidable from the rule), ` +
      `${baselined} known-below-floor held at their baseline\n`
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
