// Best-effort JSON/XML sniffing, validation, and pretty-printing — used by
// the "looks like JSON/XML" suggestion banner and the standalone Tools menu
// formatters. Deliberately dependency-free (offline app, CLAUDE.md prefers
// zero new production dependencies): no XML parser library, just a tag-stack
// scan for well-formedness and a regex-based reindent for pretty-printing.

export function detectTextFormat(content) {
  const trimmed = content.trim()
  if (!trimmed) return null
  const first = trimmed[0]
  if (first === '{' || first === '[') return { kind: 'json', ...validateJson(trimmed) }
  if (first === '<') {
    // HTML is not XML: its void elements (<meta>, <br>, <img>, <link>, …) are
    // never closed, so the XML tag-stack validator would wrongly report a
    // mismatch (e.g. "</head> expected </meta>"). Don't offer XML
    // validation/formatting for an HTML document.
    if (isHtml(trimmed)) return null
    return { kind: 'xml', ...validateXml(trimmed) }
  }
  return null
}

// A full HTML document: an HTML5 doctype, or a root <html> tag. XHTML served as
// real XML starts with an <?xml …?> declaration or an XHTML DOCTYPE and is left
// to the XML path on purpose.
function isHtml(trimmed) {
  if (/^<!doctype\s+html\b/i.test(trimmed)) {
    return !/\bDTD\s+XHTML\b/i.test(trimmed) // XHTML doctype -> treat as XML
  }
  return /^<html[\s>]/i.test(trimmed)
}

export function validateJson(content) {
  try {
    JSON.parse(content)
    return { valid: true }
  } catch (err) {
    return { valid: false, error: err.message, ...locateJsonError(err.message, content) }
  }
}

// 1-based line/column of a 0-based character offset into `content`.
function locateOffset(content, offset) {
  const upTo = content.slice(0, offset)
  const lines = upTo.split('\n')
  return { line: lines.length, column: lines[lines.length - 1].length + 1 }
}

// V8's JSON.parse errors report a 0-based character offset ("at position N")
// for most structural errors (trailing comma, missing colon, unterminated
// string); newer V8 sometimes appends "(line X column Y)" itself, but not
// for every error shape, so line/column is recomputed from the offset here
// for a result that doesn't depend on the exact engine/message format. Some
// error shapes (e.g. a single unexpected token with no offset) have no
// position at all — those just fall back to the plain message.
function locateJsonError(message, content) {
  const match = /position (\d+)/.exec(message)
  return match ? locateOffset(content, Number(match[1])) : {}
}

export function formatJson(content) {
  return JSON.stringify(JSON.parse(content), null, 2)
}

// Strip comments/CDATA/declarations before tag-scanning so tag-like text
// inside them isn't mistaken for real markup.
const STRIP_PATTERNS = [
  /<!--[\s\S]*?-->/g,
  /<!\[CDATA\[[\s\S]*?\]\]>/g,
  /<\?[\s\S]*?\?>/g,
  /<!DOCTYPE[^>]*>/gi
]

// One tag's effect on the open-element stack. Returns an error result when a
// closing tag doesn't match what's open, else null.
function trackTag({ stack, full, name, selfClose, loc }) {
  if (!full.startsWith('</')) {
    if (!selfClose) stack.push({ name, ...loc })
    return null
  }
  const expected = stack.pop()
  if (expected?.name === name) return null
  return {
    valid: false,
    error: `Mismatched closing tag </${name}>${expected ? ` (expected </${expected.name}>)` : ''}`,
    ...loc
  }
}

export function validateXml(content) {
  let scan = content
  for (const re of STRIP_PATTERNS) scan = scan.replace(re, '')

  const tagRe = /<\/?([a-zA-Z_][\w:.-]*)[^>]*?(\/?)>/g
  const stack = []
  let match
  let sawElement = false
  // Tags are never touched by STRIP_PATTERNS, so each matched tag's literal
  // text still appears verbatim (and in the same order) in the original
  // `content` — search forward for it there to get a real line/column
  // instead of one relative to the comment/CDATA-stripped scan string.
  let searchFrom = 0
  while ((match = tagRe.exec(scan))) {
    const [full, name, selfClose] = match
    sawElement = true
    const idx = content.indexOf(full, searchFrom)
    const loc = idx === -1 ? {} : locateOffset(content, idx)
    if (idx !== -1) searchFrom = idx + full.length

    const mismatch = trackTag({ stack, full, name, selfClose, loc })
    if (mismatch) return mismatch
  }
  if (!sawElement) return { valid: false, error: 'No XML elements found' }
  if (stack.length) {
    const unclosed = stack[stack.length - 1]
    return {
      valid: false,
      error: `Unclosed tag <${unclosed.name}>`,
      line: unclosed.line,
      column: unclosed.column
    }
  }
  return { valid: true }
}

// Regex-based reindent, not a full parser: splits on "><" tag boundaries and
// indents by nesting depth. Handles the common case (element-only or
// element-with-plain-text-content) well; attribute values containing a
// literal ">" would confuse the split, which is an acceptable limitation
// for a "pretty-print my XML" convenience tool.
export function formatXml(content) {
  const withBreaks = content.trim().replace(/>\s*</g, '>\n<')
  let depth = 0
  const lines = []
  for (const raw of withBreaks.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const isClosing = line.startsWith('</')
    const isSelfClosing = line.endsWith('/>')
    const isDecl = line.startsWith('<?') || line.startsWith('<!')
    const isOpenAndClose = /^<[^/][^>]*>[^<]*<\/[^>]+>$/.test(line)
    if (isClosing) depth = Math.max(0, depth - 1)
    lines.push('  '.repeat(depth) + line)
    if (!isClosing && !isSelfClosing && !isDecl && !isOpenAndClose) depth += 1
  }
  return lines.join('\n')
}
