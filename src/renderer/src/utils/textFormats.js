// Dependency-free JSON/XML sniff, validate, and pretty-print (a tag-stack scan,
// no XML library) for the suggestion banner and the Tools formatters.

export function detectTextFormat(content) {
  const trimmed = content.trim()
  if (!trimmed) return null
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  // Require the MATCHING close too, so a leading bracket in e.g. a log line isn't
  // mistaken for JSON/XML.
  if ((first === '{' && last === '}') || (first === '[' && last === ']')) {
    return { kind: 'json', ...validateJson(trimmed) }
  }
  if (first === '<' && last === '>') {
    // HTML's void elements aren't closed, so the tag-stack validator would false
    // mismatch — skip it.
    if (isHtml(trimmed)) return null
    return { kind: 'xml', ...validateXml(trimmed) }
  }
  return null
}

// A full HTML document (doctype or root <html>); real XHTML stays on the XML path.
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

// Recompute line/column from V8's "at position N" offset (independent of the
// engine's message format); no offset → plain message.
function locateJsonError(message, content) {
  const match = /position (\d+)/.exec(message)
  return match ? locateOffset(content, Number(match[1])) : {}
}

export function formatJson(content) {
  return JSON.stringify(JSON.parse(content), null, 2)
}

// Stripped before tag-scanning so tag-like text inside them isn't read as markup.
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
  // Find each tag in the ORIGINAL content for a real line/column (not one
  // relative to the stripped scan string).
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

// Regex reindent (not a parser): splits on "><" and indents by depth. An
// attribute value with a literal ">" would confuse it — acceptable here.
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
