import { zipSync, strToU8 } from 'fflate'

// Minimal .xlsx writer for screenshot/test fixtures — inline strings only, no
// styles or shared-strings table. Kept deliberately tiny; the app's own parser
// (src/main/xlsx) is the compatibility contract, not a full OOXML implementation.

const esc = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])

const colLetter = (n) => {
  let s = ''
  for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s
  return s
}

function cellXml(rowIdx, colIdx, value) {
  const ref = `${colLetter(colIdx)}${rowIdx + 1}`
  if (value === '' || value === null || value === undefined) return ''
  if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`
}

function sheetXml(rows) {
  const body = rows
    .map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cellXml(r, c, v)).join('')}</row>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

/**
 * @param {{name: string, rows: Array<Array<string|number>>}[]} sheets
 * @returns {Uint8Array} zipped .xlsx bytes
 */
export function makeXlsx(sheets) {
  const files = {}
  const sheetRefs = sheets.map((s, i) => ({ name: s.name, rid: `rId${i + 1}`, path: `worksheets/sheet${i + 1}.xml` }))

  files['[Content_Types].xml'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetRefs
      .map(
        (s) =>
          `<Override PartName="/xl/${s.path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join('')}</Types>`

  files['_rels/.rels'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

  files['xl/workbook.xml'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetRefs
      .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="${s.rid}"/>`)
      .join('')}</sheets></workbook>`

  files['xl/_rels/workbook.xml.rels'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRefs
      .map(
        (s) =>
          `<Relationship Id="${s.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${s.path}"/>`
      )
      .join('')}</Relationships>`

  sheets.forEach((s, i) => {
    files[`xl/${sheetRefs[i].path}`] = sheetXml(s.rows)
  })

  const zipped = {}
  for (const [k, v] of Object.entries(files)) zipped[k] = strToU8(v)
  return zipSync(zipped)
}
