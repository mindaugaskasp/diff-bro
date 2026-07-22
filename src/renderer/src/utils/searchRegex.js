// Guardrails for user-supplied regular-expression search. A diff search runs the
// pattern synchronously against the full document on every keystroke, so a
// pathological pattern (catastrophic backtracking) would freeze the renderer.
// These checks keep regex search useful while refusing the shapes that are known
// to blow up. Pure and unit-tested; the DiffViewer search calls it before ever
// handing a pattern to Monaco.

// Patterns longer than this are refused outright — long user regexes are rare in
// a search box and are the easiest lever for an accidental (or hostile) ReDoS.
export const MAX_REGEX_LENGTH = 200

// A quantifier applied to a group whose body already ends in a quantifier —
// e.g. (a+)+, (a*)*, (\d+){2,} — is the classic catastrophic-backtracking shape.
// Detecting it exactly needs a parser; this signature catches the common forms
// (inner quantifier, group close, outer quantifier) without rejecting ordinary
// quantified groups like (abc)+.
const NESTED_QUANTIFIER = /[*+][)\]]\s*[*+{]/

// Returns { ok: true } for a pattern that is safe to compile and run, or
// { ok: false, error } describing why it was refused.
export function checkRegex(pattern) {
  if (typeof pattern !== 'string' || pattern === '') return { ok: false, error: 'empty' }
  if (pattern.length > MAX_REGEX_LENGTH) return { ok: false, error: 'too-long' }
  if (NESTED_QUANTIFIER.test(pattern)) return { ok: false, error: 'nested-quantifier' }
  try {
    // Compiling validates the syntax; the result is discarded — Monaco does its
    // own compilation for the actual search.
    new RegExp(pattern)
  } catch {
    return { ok: false, error: 'invalid' }
  }
  return { ok: true }
}
