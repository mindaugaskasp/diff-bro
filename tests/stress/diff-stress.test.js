// Stress benchmark for BOTH comparable kinds: how big can a file get before
// loading/diffing it hangs the app? Opt-in — it's slow and machine-dependent,
// so it's skipped unless STRESS=1, and never runs in `npm run check`:
//
//   STRESS=1 npx vitest run tests/stress/diff-stress.test.js
//
// It lives under vitest (not a bare node script) because the parser leans on
// fflate, whose Uint8Array checks break under a raw ESM loader's realm — the
// Vite pipeline the rest of the suite uses handles it correctly.
//
// What it measures is the CPU half the app owns: parse (.xlsx) + row alignment
// for spreadsheets, and the unified-patch generator for text. The DOM/Monaco
// render is the separate *viewing* ceiling and is measured in the Docker env;
// both kinds already cap what they hand the view (spreadsheet: RENDER_ROW_CAP;
// text: the 10 MB file-size prompt in main + MAX_DIFF_LINES on the patch).
import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { readXlsx } from '../../src/main/xlsx/index'
import { alignRows } from '../../src/renderer/src/utils/alignRows'
import { toUnifiedDiff, MAX_DIFF_LINES } from '../../src/renderer/src/utils/unifiedDiff'

const RUN = !!process.env.STRESS
const COLS = 12
const SLUGGISH_MS = 1_000
const HANG_MS = 3_000

const time = (fn) => {
  const t = process.hrtime.bigint()
  const out = fn()
  return { ms: Number(process.hrtime.bigint() - t) / 1e6, out }
}
const verdict = (ms) => (ms < 100 ? 'smooth' : ms < SLUGGISH_MS ? 'ok' : ms < HANG_MS ? 'sluggish' : 'HANG')
const padL = (s, n) => String(s).padStart(n)

function sheetXml(rowCount, mutate = null) {
  let body = ''
  for (let i = 1; i <= rowCount; i++) {
    let row = `<row r="${i}">`
    for (let c = 0; c < COLS; c++) {
      const ref = String.fromCharCode(65 + c) + i
      if (c === 0) row += `<c r="${ref}" t="inlineStr"><is><t>row-${i}</t></is></c>`
      else row += `<c r="${ref}"><v>${(i * 31 + c * 7) % 1000 + (mutate?.(i) && c === 3 ? 500 : 0)}</v></c>`
    }
    body += row + '</row>'
  }
  return `<?xml version="1.0"?><worksheet><sheetData>${body}</sheetData></worksheet>`
}

function buildXlsx(xml) {
  // Every zip entry value must be a Uint8Array — a raw string sends fflate's
  // flatten into infinite recursion over the string's characters.
  return Buffer.from(
    zipSync({
      'xl/workbook.xml': strToU8(
        '<workbook xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'
      ),
      'xl/_rels/workbook.xml.rels': strToU8(
        '<Relationships><Relationship Id="rId1" ' +
          'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
          'Target="worksheets/sheet1.xml"/></Relationships>'
      ),
      'xl/worksheets/sheet1.xml': strToU8(xml)
    })
  )
}

describe.skipIf(!RUN)('spreadsheet stress — parse + align', () => {
  it('reports the size/latency curve and stays usable to ~10k rows', { timeout: 120_000 }, () => {
    const counts = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000]
    console.log(`\nSpreadsheet — ${COLS} cols, ~5% rows changed`)
    console.log('rows'.padEnd(9) + padL('MB', 8) + padL('parse', 8) + padL('align', 8) + padL('total', 8) + '  verdict')
    let tenK = 0
    for (const rows of counts) {
      const left = buildXlsx(sheetXml(rows))
      const right = buildXlsx(sheetXml(rows, (i) => i % 20 === 0))
      const p = time(() => readXlsx(left, { maxCells: 5_000_000 }))
      const p2 = time(() => readXlsx(right, { maxCells: 5_000_000 }))
      const a = time(() => alignRows(p.out.sheets[0].rows, p2.out.sheets[0].rows))
      const totalMs = p.ms + p2.ms + a.ms
      if (rows === 10_000) tenK = totalMs
      console.log(
        String(rows).padEnd(9) +
          padL((left.length / 1048576).toFixed(1), 8) +
          padL((p.ms + p2.ms).toFixed(0), 8) +
          padL(a.ms.toFixed(0), 8) +
          padL(totalMs.toFixed(0), 8) +
          `  ${verdict(totalMs)}`
      )
    }
    expect(tenK).toBeLessThan(HANG_MS)
  })
})

describe.skipIf(!RUN)('text stress — unified patch generator', () => {
  it('reports latency up to its line cap and refuses beyond it', () => {
    console.log(`\nText — unified patch (MAX_DIFF_LINES=${MAX_DIFF_LINES})`)
    console.log('lines'.padEnd(9) + padL('ms', 8) + '  verdict')
    for (const lines of [1_000, 2_000, MAX_DIFF_LINES]) {
      const a = Array.from({ length: lines }, (_, i) => `line ${i}`).join('\n')
      const b = a.replace(/line 5\d\b/g, 'CHANGED')
      const r = time(() => toUnifiedDiff(a, b))
      console.log(String(lines).padEnd(9) + padL(r.ms.toFixed(1), 8) + `  ${verdict(r.ms)}`)
      expect(r.out.patch).toBeDefined()
    }
    // Past the cap the generator refuses rather than grinding — the app's text
    // hang guard, alongside the 10 MB file-size prompt on load.
    const huge = Array.from({ length: MAX_DIFF_LINES + 1 }, (_, i) => `l${i}`).join('\n')
    expect(toUnifiedDiff(huge, huge + '\nx').error).toBe('too-large')
    console.log('')
  })
})
