// Installed faces only: the app never downloads a font, and a missing one silently falls back.

export const EDITOR_FONTS = [
  'SF Mono',
  'Menlo',
  'Monaco',
  'Consolas',
  'Cascadia Code',
  'Cascadia Mono',
  'JetBrains Mono',
  'Fira Code',
  'Fira Mono',
  'Source Code Pro',
  'IBM Plex Mono',
  'Roboto Mono',
  'Ubuntu Mono',
  'DejaVu Sans Mono',
  'Liberation Mono',
  'Hack',
  'Inconsolata',
  'Courier New'
]

const SAMPLE = '12px'
const FALLBACKS = ['monospace', 'serif']

/**
 * Installed when it changes the measured width against both generic fallbacks;
 * a missing family renders in the fallback and measures exactly like it.
 * @param {string} family
 * @param {(css: string) => number} measure  width of a fixed sample in that CSS font
 */
export function isFontInstalled(family, measure) {
  return FALLBACKS.every(
    (fallback) => measure(`${SAMPLE} "${family}", ${fallback}`) !== measure(`${SAMPLE} ${fallback}`)
  )
}

/** @param {(css: string) => number} measure @returns {string[]} */
export const installedFonts = (measure) => EDITOR_FONTS.filter((f) => isFontInstalled(f, measure))

/** '' is the default face. Anything else must be on the list: it reaches CSS. */
export const isEditorFont = (value) => value === '' || EDITOR_FONTS.includes(value)

/** @param {string} family @returns {string} '' keeps Monaco's own default */
export const fontStack = (family) => (family ? `"${family}", monospace` : '')
