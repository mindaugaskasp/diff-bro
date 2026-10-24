const MAC = { f: 'find', 'f+alt': 'replace' }
const PC = { f: 'find', h: 'replace' }

// The physical key: ⌥ turns F into ƒ on a Mac, so `key` alone would miss ⌘⌥F.
const letter = (e) => (e.code?.startsWith('Key') ? e.code.slice(3) : (e.key ?? '')).toLowerCase()

const hasFindModifier = (e, isMac) =>
  !e.shiftKey && (isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)

/**
 * @param {KeyboardEvent} e
 * @param {{ isMac: boolean }} platform
 * @returns {'find'|'replace'|null}
 */
export function findKeyAction(e, { isMac }) {
  if (!hasFindModifier(e, isMac)) return null
  return (isMac ? MAC : PC)[letter(e) + (e.altKey ? '+alt' : '')] ?? null
}
