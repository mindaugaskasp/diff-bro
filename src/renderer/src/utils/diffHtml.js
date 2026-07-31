// Render a comparison as a self-contained HTML document for pasting into a
// ticket or PR: inline CSS, no external assets (so it opens anywhere and can't
// phone home), and every piece of user text goes through esc() before it lands
// in the markup. Pure, so it's unit-tested. { error } past the size guard.
import { diffLines } from './unifiedDiff'

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ESC[c])

const STYLE = `
  body{margin:0;background:#f6f8fa;color:#1f2328;font:13px/1.6 -apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:1100px;margin:0 auto;padding:28px 20px}
  h1{font-size:16px;margin:0 0 4px}
  .sub{color:#57606a;font-size:12px;margin:0 0 18px}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #d0d7de;border-radius:6px;overflow:hidden;
    font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
  td{padding:0 8px;white-space:pre;vertical-align:top}
  td.ln{width:1%;text-align:right;color:#8c959f;user-select:none;background:#f6f8fa}
  td.sg{width:1%;text-align:center;color:#8c959f;user-select:none}
  tr.add{background:#e6ffec} tr.add td.sg{color:#1a7f37}
  tr.del{background:#ffebe9} tr.del td.sg{color:#cf222e}
`

/**
 * @param {string} leftText
 * @param {string} rightText
 * @param {{ leftName?: string, rightName?: string }} [names]
 * @returns {{ html: string } | { error: string }}
 */
export function diffToHtml(leftText, rightText, { leftName = 'Left', rightName = 'Right' } = {}) {
  const result = diffLines(leftText, rightText)
  if (result.error) return { error: result.error }
  const rows = result.lines
    .map((l) => {
      const cls = l.sign === '+' ? 'add' : l.sign === '-' ? 'del' : 'ctx'
      return (
        `<tr class="${cls}"><td class="ln">${l.oldNo ?? ''}</td>` +
        `<td class="ln">${l.newNo ?? ''}</td>` +
        `<td class="sg">${esc(l.sign.trim())}</td><td>${esc(l.text)}</td></tr>`
      )
    })
    .join('')
  const title = `${esc(leftName)} ↔ ${esc(rightName)}`
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title} — Diff Bro</title>
<style>${STYLE}</style></head>
<body><div class="wrap">
<h1>${title}</h1>
<p class="sub">Generated offline by Diff Bro — nothing left this machine.</p>
<table><tbody>${rows}</tbody></table>
</div></body></html>`
  return { html }
}
