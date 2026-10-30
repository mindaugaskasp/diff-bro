import { test, openSide, clickAppMenuItem, setViewOption } from '../../e2e/fixtures.mjs'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// #144: the pane labels on a grid, which the overlay covers the header row of.
const OUT = 'design/render/out/grid-labels'

const LEFT =
  'Metric,Q1,Q2,Q3,Q4\nRevenue,1100,1180,1245,1300\nCosts,600,640,690,700\nHeadcount,40,42,44,45\n'
const RIGHT =
  'Metric,Q1,Q2,Q3,Q4\nRevenue,1100,1180,1310,1390\nCosts,600,640,690,720\nHeadcount,40,42,47,50\n'

const STRIP = `
  .sheet-viewer > .pane-labels { height: 24px !important; align-items: center !important; }
  .sheet-viewer > .pane-labels .pane-label { margin-top: 0 !important; }`

const IN_BAND = () => {
  const labels = document.querySelector('.sheet-viewer > .pane-labels')
  labels.className = labels.className.replace('split', 'joined')
  labels.style.cssText =
    'height:auto;display:flex;align-items:center;gap:4px;padding:0 0 0 12px;margin-right:auto'
  const arrow = document.createElement('span')
  arrow.textContent = '↔'
  arrow.style.cssText = 'color:var(--text-meta);font-size:var(--font-xs)'
  labels.firstElementChild.after(arrow)
  labels.querySelectorAll('.pane-label').forEach((l) => {
    l.style.cssText = 'margin:0;grid-column:auto'
  })
  document.querySelector('.sheet-bar .grid-tools').before(labels)
}

const VARIANTS = { today: {}, strip: { css: STRIP }, band: { js: IN_BAND } }

for (const theme of ['light', 'dark']) {
  test(`grid labels ${theme}`, async ({ app, page }) => {
    mkdirSync(OUT, { recursive: true })
    const dir = mkdtempSync(join(tmpdir(), 'diffbro-render-'))
    const l = join(dir, 'budget-2024.csv')
    const r = join(dir, 'budget-2025.csv')
    writeFileSync(l, LEFT)
    writeFileSync(r, RIGHT)
    await page.setViewportSize({ width: 1280, height: 800 })
    if (theme === 'dark') await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
    await openSide(app, page, 'left', l)
    await openSide(app, page, 'right', r)
    await page
      .locator('.sheet-bar')
      .waitFor({ timeout: 5000 })
      .catch(async () => {
        await setViewOption(page, /grid/i, true)
        await page.locator('.sheet-bar').waitFor()
      })
    for (const [variant, { css, js }] of Object.entries(VARIANTS)) {
      if (css) await page.addStyleTag({ content: css })
      if (js) await page.evaluate(js)
      await page.mouse.move(1270, 790)
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${OUT}/${variant}-${theme}.png` })
      await page.evaluate(() => document.querySelectorAll('head style:last-child').length)
      if (css) {
        await page.evaluate(() => document.head.lastElementChild.remove())
      }
    }
  })
}
