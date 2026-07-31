// Snippet names are sentence-cased on every save so a library built up over time
// reads uniformly, however each name was typed.

/**
 * Uppercase the first character only, leaving the rest exactly as written — an
 * acronym or camelCase tail ('iOS build steps', 'JWT notes') must survive, which
 * title-casing would destroy. Splits by code point so an astral first character
 * is not cut in half.
 * @param {string} name
 * @returns {string}
 */
export function sentenceCaseName(name) {
  const [first, ...rest] = Array.from(String(name ?? ''))
  return first === undefined ? '' : first.toLocaleUpperCase() + rest.join('')
}

const pad = (n) => String(n).padStart(2, '0')

/**
 * Fallback name for a snippet saved without one. Stamped with the local minute
 * so a library of quick captures stays distinguishable — 'Untitled snippet' on
 * its own gives every one of them the same label. Built from date parts rather
 * than toLocaleString so it does not shift with locale or test environment.
 * @param {Date} [now]
 * @returns {string}
 */
export function untitledName(now = new Date()) {
  const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `Untitled ${d} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}
