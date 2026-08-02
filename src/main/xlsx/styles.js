// styles.xml, read for one thing only: the number format behind each cell's
// `s` index, so a date stops rendering as its serial. Fills, fonts, borders and
// conditional formatting are never interpreted.
import { Parser, decode } from 'saxen'
import { XlsxError, rejectDoctype } from './errors'
import { builtinFormat } from './numfmt'

const MAX_FORMATS = 65_536

function addFormat(st, getAttrs) {
  if (!st.inNumFmts) return
  const a = getAttrs()
  const id = Number.parseInt(a['numFmtId'] ?? '', 10)
  if (Number.isInteger(id)) st.custom.set(id, decode(a['formatCode'] ?? ''))
}

function addXf(st, getAttrs) {
  if (!st.inCellXfs || st.codes.length >= MAX_FORMATS) return
  const id = Number.parseInt(getAttrs()['numFmtId'] ?? '0', 10)
  st.codes.push(Number.isInteger(id) ? id : 0)
}

function onOpen(st, name, getAttrs) {
  if (name === 'cellXfs') st.inCellXfs = true
  else if (name === 'numFmts') st.inNumFmts = true
  else if (name === 'numFmt') addFormat(st, getAttrs)
  else if (name === 'xf') addXf(st, getAttrs)
}

/**
 * Format code per cellXfs index — what a cell's `s` attribute points at.
 * `<xf>` inside cellStyleXfs is a NAMED style, not a cell's, and `<numFmt>`
 * inside `<dxfs>` belongs to conditional formatting; both are skipped.
 * @returns {string[]}
 */
export function parseStyles(xml) {
  rejectDoctype(xml)
  const st = { custom: new Map(), codes: [], inCellXfs: false, inNumFmts: false }

  const p = new Parser()
  p.on('openTag', (name, getAttrs) => onOpen(st, name, getAttrs))
  p.on('closeTag', (name) => {
    if (name === 'cellXfs') st.inCellXfs = false
    else if (name === 'numFmts') st.inNumFmts = false
  })
  p.on('error', (err) => {
    throw new XlsxError('parse', `malformed styles XML: ${err}`)
  })
  p.parse(xml)

  return st.codes.map((id) => st.custom.get(id) ?? builtinFormat(id))
}
