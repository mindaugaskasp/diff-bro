// The selectable colour themes. Pure data + helpers (no Vue/store), so the
// store, the Monaco wiring, and the Mermaid renderer all share one source of
// truth for what a theme is and whether it sits on a dark or light ground.
//
// `dark` drives the editor/diagram theme: dark-ground themes get Monaco's
// vs-dark and Mermaid's dark theme; light-ground themes get vs / default. The
// palette itself lives in styles/themes.css, keyed by the same id.
// `swatch` is just for the Settings picker's preview chips.
export const THEMES = [
  {
    id: 'light',
    label: 'Light',
    dark: false,
    swatch: { bg: '#ffffff', accent: '#0969da', add: '#1a7f37', del: '#cf222e' }
  },
  {
    id: 'dark',
    label: 'Dark',
    dark: true,
    swatch: { bg: '#161b22', accent: '#2f81f7', add: '#3fb950', del: '#f85149' }
  },
  {
    id: 'solar',
    label: 'Solar',
    dark: false,
    swatch: { bg: '#fbf2dd', accent: '#e8590c', add: '#2f9e44', del: '#e03131' }
  },
  {
    id: 'neon',
    label: 'Neon',
    dark: true,
    swatch: { bg: '#111829', accent: '#22d3ee', add: '#4ade80', del: '#fb7185' }
  },
  {
    id: 'contrast',
    label: 'Contrast',
    dark: false,
    swatch: { bg: '#ffffff', accent: '#1633d4', add: '#05702f', del: '#c20000' }
  },
  {
    id: 'nord',
    label: 'Nord',
    dark: true,
    swatch: { bg: '#3b4252', accent: '#88c0d0', add: '#a3be8c', del: '#bf616a' }
  },
  {
    id: 'sepia',
    label: 'Sepia',
    dark: false,
    swatch: { bg: '#dfcea6', accent: '#9c4f1f', add: '#5a6f28', del: '#933a22' }
  },
  {
    id: 'nyan',
    label: 'Nyan',
    dark: true,
    swatch: { bg: '#231033', accent: '#ff2ecb', add: '#63ff4d', del: '#ff5470' }
  }
]

export const DEFAULT_THEME = 'light'

const BY_ID = new Map(THEMES.map((t) => [t.id, t]))

export const isValidTheme = (id) => BY_ID.has(id)
// Unknown/absent ids fall back to the default rather than breaking the UI.
export const normalizeTheme = (id) => (BY_ID.has(id) ? id : DEFAULT_THEME)
export const isDarkTheme = (id) => BY_ID.get(id)?.dark ?? false

// The theme for a given calendar day — random-looking but STABLE within a day,
// so the "rotate daily" option doesn't reshuffle on every launch, only at the
// date rollover. Deterministic hash of the local Y-M-D → an index into THEMES.
export function themeForDay(date = new Date()) {
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return THEMES[hash % THEMES.length].id
}
