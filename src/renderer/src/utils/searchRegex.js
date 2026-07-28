// Guardrails for user regex search — the pattern runs synchronously on every
// keystroke, so a catastrophic-backtracking one would freeze the renderer.

export const MAX_REGEX_LENGTH = 200

// A quantifier on a GROUP already ending in one (e.g. (a+)+) is the classic
// backtracking bomb. Only ')' counts, never ']' — [-+]+ etc. are linear.
const NESTED_QUANTIFIER = /[*+]\)\s*[*+{]/

// { ok } or { ok:false, error }.
export function checkRegex(pattern) {
  if (typeof pattern !== 'string' || pattern === '') return { ok: false, error: 'empty' }
  if (pattern.length > MAX_REGEX_LENGTH) return { ok: false, error: 'too-long' }
  if (NESTED_QUANTIFIER.test(pattern)) return { ok: false, error: 'nested-quantifier' }
  try {
    new RegExp(pattern) // validates syntax; result discarded

  } catch {
    return { ok: false, error: 'invalid' }
  }
  return { ok: true }
}
