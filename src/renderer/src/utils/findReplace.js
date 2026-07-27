// Find-and-replace for the Tools dialog. Three match modes:
//   text   literal substring
//   word   literal, but only whole-word occurrences (\b boundaries)
//   regex  the find field is a JS regular expression ($1 backreferences work)
// Returns the transformed text plus a replacement count, or { error } when a
// regex won't compile. The pattern runs only on the user's own local text, so a
// pathological expression can stall this window and nothing beyond it.
const SPECIAL = /[.*+?^${}()|[\]\\]/g

function buildRegex(find, mode, caseInsensitive) {
  const flags = caseInsensitive ? 'gi' : 'g'
  if (mode === 'regex') return new RegExp(find, flags)
  const escaped = find.replace(SPECIAL, '\\$&')
  return new RegExp(mode === 'word' ? `\\b${escaped}\\b` : escaped, flags)
}

/**
 * @param {{ text?: string, find: string, replace?: string,
 *           mode?: 'text'|'word'|'regex', caseInsensitive?: boolean }} opts
 * @returns {{ output: string, count: number, error?: string }}
 */
export function replaceText({ text = '', find, replace = '', mode = 'text', caseInsensitive = false }) {
  if (!find) return { output: text, count: 0 }
  let re
  try {
    re = buildRegex(find, mode, caseInsensitive)
  } catch (e) {
    return { output: text, count: 0, error: `Invalid regular expression: ${e.message}` }
  }
  const matches = text.match(re)
  const count = matches ? matches.length : 0
  // Literal modes replace through a function so $-sequences in the replacement
  // stay literal; regex mode replaces natively so $1 backreferences resolve.
  const output = mode === 'regex' ? text.replace(re, replace) : text.replace(re, () => replace)
  return { output, count }
}
