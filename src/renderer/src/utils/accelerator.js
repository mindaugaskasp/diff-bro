// Electron global-accelerator helpers for the configurable quick look-up
// shortcut. Pure (no Vue, no Electron, no stores) so the capture UI and its
// tests share one definition of what a valid accelerator is, and one mapping
// from a keypress to Electron's accelerator string.

// Electron modifier tokens we emit. CommandOrControl abstracts Cmd (macOS) and
// Ctrl (Windows/Linux) so one stored binding works on every platform.
const MODIFIERS = ['CommandOrControl', 'Alt', 'Shift', 'Super']

// Map a KeyboardEvent's PHYSICAL key (e.code, layout-stable) to an Electron key
// token. Returns null for a modifier-only press or a key we don't support.
function keyToken(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3) // KeyA → A
  if (/^Digit[0-9]$/.test(code)) return code.slice(5) // Digit1 → 1
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code // F1 … F24
  return NAMED[code] ?? null
}

const NAMED = {
  Space: 'Space',
  Enter: 'Return',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Escape: 'Escape',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/'
}

/**
 * Build an Electron accelerator string from a keydown event, or null when the
 * event carries only modifiers / an unsupported key.
 * @param {KeyboardEvent} e
 * @returns {string|null}
 */
export function acceleratorFromEvent(e) {
  const key = keyToken(e.code)
  if (!key) return null
  const parts = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}

/**
 * A binding worth registering GLOBALLY needs at least one modifier plus exactly
 * one non-modifier key — a bare key would hijack that key system-wide.
 * @param {string} str
 * @returns {boolean}
 */
export function isValidAccelerator(str) {
  if (typeof str !== 'string' || !str) return false
  const parts = str.split('+')
  const mods = parts.filter((p) => MODIFIERS.includes(p))
  const keys = parts.filter((p) => !MODIFIERS.includes(p))
  return mods.length >= 1 && keys.length === 1 && keys[0].length > 0
}

/**
 * A human-readable label for an accelerator, platform-appropriate. Glyphs like ⌘
 * are prose here (a shortcut label), not icons — allowed by the SVG-icons rule.
 * @param {string} str
 * @param {boolean} mac  render macOS glyphs
 * @returns {string}
 */
export function acceleratorLabel(str, mac) {
  if (typeof str !== 'string' || !str) return ''
  const token = (p) => {
    if (p === 'CommandOrControl') return mac ? '⌘' : 'Ctrl'
    if (p === 'Alt') return mac ? '⌥' : 'Alt'
    if (p === 'Shift') return mac ? '⇧' : 'Shift'
    if (p === 'Super') return mac ? '⌘' : 'Super'
    return p
  }
  return str.split('+').map(token).join(mac ? ' ' : '+')
}
