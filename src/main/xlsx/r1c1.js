// A1 cell references inside a formula, translated two ways: normalised to R1C1
// (position-independent, so a row insert stops flagging every formula below it)
// and shifted by a row/column delta (how a shared formula reaches its followers).

// A reference, guarded on both sides so LOG10, 1.5E10 and A1B2 are not refs.
// A leading $ pins the column, one before the digits pins the row.
const REF = /(?<![A-Za-z0-9_.$])(\$?[A-Za-z]{1,3}\$?[0-9]{1,7})(?![A-Za-z0-9_.(])/g
const PARTS = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]+)$/

function splitRef(ref) {
  const [, colAbs, letters, rowAbs, digits] = PARTS.exec(ref)
  return { colAbs, letters, rowAbs, digits }
}

const MAX_COL = 16384
const MAX_ROW = 1048576

function colNumber(letters) {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

function colLetters(n) {
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

// Walks the formula, applying `fn` only outside quoted text: "literal" strings
// and 'sheet name' quotes both hide things that look like references.
function mapRefs(text, fn) {
  let out = ''
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"' || ch === "'") {
      const end = closingQuote(text, i, ch)
      out += text.slice(i, end)
      i = end
      continue
    }
    const next = nextQuote(text, i)
    out += text.slice(i, next).replace(REF, fn)
    i = next
  }
  return out
}

function closingQuote(text, start, quote) {
  let i = start + 1
  while (i < text.length) {
    if (text[i] !== quote) i++
    else if (text[i + 1] === quote) i += 2
    else return i + 1
  }
  return text.length
}

function nextQuote(text, from) {
  const d = text.indexOf('"', from)
  const s = text.indexOf("'", from)
  if (d < 0) return s < 0 ? text.length : s
  return s < 0 ? d : Math.min(d, s)
}

function axis(letter, abs, index, origin) {
  if (abs) return `${letter}${index}`
  const delta = index - origin
  return delta === 0 ? letter : `${letter}[${delta}]`
}

/**
 * Formula text (no leading `=`) with every reference rewritten in R1C1 form,
 * relative to the cell that holds it. Two formulas that mean the same thing at
 * different positions normalise to the same string.
 * @param {string} text
 * @param {number} row 0-based row of the owning cell
 * @param {number} col 0-based column
 */
export function toR1C1(text, row, col) {
  return mapRefs(text, (ref) => {
    const { colAbs, letters, rowAbs, digits } = splitRef(ref)
    const c = colNumber(letters)
    const r = Number(digits)
    if (c > MAX_COL || r > MAX_ROW || r < 1) return ref
    return axis('R', rowAbs, r, row + 1) + axis('C', colAbs, c, col + 1)
  })
}

/**
 * Formula text with every RELATIVE reference moved by a row/column delta —
 * absolute ($) parts stay put, exactly as Excel expands a shared formula.
 * A reference pushed off the sheet becomes #REF!, as it does in Excel.
 */
export function shiftFormula(text, dRow, dCol) {
  if (!dRow && !dCol) return text
  return mapRefs(text, (ref) => {
    const { colAbs, letters, rowAbs, digits } = splitRef(ref)
    const c = colNumber(letters) + (colAbs ? 0 : dCol)
    const r = Number(digits) + (rowAbs ? 0 : dRow)
    if (c < 1 || r < 1 || c > MAX_COL || r > MAX_ROW) return '#REF!'
    return `${colAbs}${colLetters(c)}${rowAbs}${r}`
  })
}
