// Syntax colouring for the launcher, which cannot carry Monaco: the Quick Look
// window's whole value is appearing the instant the shortcut is pressed. Prism
// hands back TOKENS, so the preview still renders through text interpolation
// and rule 8 holds. The main window uses Monaco (useHighlightedCode).
//
import Prism from '../prism-setup'

// Snippet language ids are Monaco's; a few differ from Prism's.
const GRAMMARS = { shell: 'bash', dockerfile: 'docker', html: 'markup', xml: 'markup' }

// Prism's token types → the five roles the --syn-* tokens paint. Anything
// unlisted stays plain: identifiers and punctuation are most of a line, and
// colouring them is what stops the rest from standing out.
const ROLES = {
  comment: 'comment',
  prolog: 'comment',
  doctype: 'comment',
  cdata: 'comment',
  string: 'string',
  'attr-value': 'string',
  char: 'string',
  regex: 'string',
  number: 'number',
  boolean: 'number',
  constant: 'number',
  keyword: 'keyword',
  atrule: 'keyword',
  important: 'keyword',
  key: 'property',
  'attr-name': 'property',
  property: 'property',
  tag: 'property',
  selector: 'property',
  builtin: 'property',
  'class-name': 'property',
  function: 'property'
}

const roleOf = (type) => ROLES[type] ?? ''

function grammarFor(language) {
  const id = String(language ?? '')
  if (!id || id === 'plaintext') return null
  return Prism.languages[GRAMMARS[id] ?? id] ?? null
}

// Prism nests tokens; the preview wants one flat run per coloured stretch. A
// nested token keeps its OWN role where it has one and inherits its parent's
// otherwise, so a string inside a tag still reads as a string.
function flatten(tokens, inherited, out) {
  for (const token of tokens) {
    if (typeof token === 'string') {
      out.push({ text: token, role: inherited })
      continue
    }
    const role = roleOf(token.type) || inherited
    if (Array.isArray(token.content)) flatten(token.content, role, out)
    else out.push({ text: String(token.content), role })
  }
  return out
}

/** Merge neighbours sharing a role, so a line is a handful of spans, not dozens. */
function coalesce(spans) {
  const out = []
  for (const span of spans) {
    if (!span.text) continue
    const last = out[out.length - 1]
    if (last && last.role === span.role) last.text += span.text
    else out.push({ ...span })
  }
  return out
}

/**
 * One line as coloured runs, covering it whole so joining them gives it back.
 * @returns {{ text: string, role: string }[]}
 */
export function miniSpans(line, language) {
  const text = String(line ?? '')
  const grammar = grammarFor(language)
  if (!grammar || !text) return [{ text, role: '' }]
  let spans
  try {
    spans = coalesce(flatten(Prism.tokenize(text, grammar), '', []))
  } catch {
    return [{ text, role: '' }]
  }
  // Colouring must never cost a character of the snippet.
  return spans.length && spans.map((s) => s.text).join('') === text ? spans : [{ text, role: '' }]
}

/** Every line of a snippet, ready for the preview's own line divs. */
export function miniLines(text, language) {
  return String(text ?? '')
    .split('\n')
    .map((line) => miniSpans(line, language))
}
