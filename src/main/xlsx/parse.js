import { Parser, decode } from 'saxen'
import { XlsxError, rejectDoctype } from './errors'

// SAX parser whose XML errors surface as XlsxError, not saxen's bare-string throw.
function newParser(onOpen, onClose, onText) {
  const p = new Parser()
  if (onOpen) p.on('openTag', onOpen)
  if (onClose) p.on('closeTag', onClose)
  if (onText) p.on('text', onText)
  p.on('error', (err) => {
    throw new XlsxError('parse', `malformed XML: ${err}`)
  })
  return p
}

// Rich-text <t> fragments concatenate; phonetic runs (<rPh>) are skipped.
export function parseSharedStrings(xml) {
  rejectDoctype(xml)
  const strings = []
  let cur = null
  let inT = false
  let phonetic = 0
  const p = newParser(
    (name) => {
      if (name === 'si') cur = ''
      else if (name === 'rPh') phonetic++
      else if (name === 't' && !phonetic) inT = true
    },
    (name) => {
      if (name === 't') inT = false
      else if (name === 'rPh') phonetic--
      else if (name === 'si') {
        strings.push(cur ?? '')
        cur = null
      }
    },
    (val, decodeEntities) => {
      if (inT) cur += decodeEntities(val)
    }
  )
  p.parse(xml)
  return strings
}

// workbook.xml lists sheets in display order with a relationship id that
// _rels/workbook.xml.rels maps to the actual worksheet path. `date1904` picks
// the epoch every date serial in the file is counted from.
export function parseWorkbook(xml) {
  rejectDoctype(xml)
  const sheets = []
  let date1904 = false
  const p = newParser((name, getAttrs) => {
    if (name === 'workbookPr') {
      const v = getAttrs()['date1904']
      date1904 = v === '1' || v === 'true'
    } else if (name === 'sheet') {
      const a = getAttrs()
      const state = a['state'] ?? ''
      sheets.push({
        name: decode(a['name'] ?? ''),
        rid: a['r:id'] ?? a['r:Id'] ?? '',
        hidden: state === 'hidden' || state === 'veryHidden'
      })
    }
  })
  p.parse(xml)
  return { sheets, date1904 }
}

// Attacker-controlled ids as keys go in a Map, never a plain object (proto-safe).
export function parseRels(xml) {
  rejectDoctype(xml)
  const map = new Map()
  const p = newParser((name, getAttrs) => {
    if (name !== 'Relationship') return
    const a = getAttrs()
    if (a['Id'] && a['Target']) map.set(a['Id'], a['Target'])
  })
  p.parse(xml)
  return map
}

// "B12" -> 1 (0-based column). Bijective base-26 over the leading letters;
// returns -1 when the ref has no letter prefix.
export function colToIndex(ref) {
  let col = 0
  let seen = false
  for (let i = 0; i < ref.length; i++) {
    const ch = ref.charCodeAt(i)
    if (ch < 65 || ch > 90) break
    col = col * 26 + (ch - 64)
    seen = true
  }
  return seen ? col - 1 : -1
}

// Relationship targets are relative to xl/ ("worksheets/sheet1.xml") or absolute
// from the package root ("/xl/worksheets/sheet1.xml").
export function resolveTarget(target) {
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`
}
