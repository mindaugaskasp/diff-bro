import { test, openSide, clickAppMenuItem, setViewOption } from '../../e2e/fixtures.mjs'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// #144 slice 8: the pane labels over every viewer, and the start and waiting states.
const OUT = 'design/render/out/comparison'

const PAIRS = {
  text: [
    'replicas: 3\nimage: api:1.41\nlog_level: warn\n',
    'replicas: 3\nimage: api:1.42\nlog_level: debug\n',
    'txt'
  ],
  structure: ['{"a":1,"b":{"c":2}}', '{"a":1,"b":{"c":3},"d":4}', 'json'],
  spreadsheet: ['id,name\n1,alpha\n2,beta\n', 'id,name\n1,alpha\n2,gamma\n3,delta\n', 'csv'],
  diagram: ['graph TD\n  A-->B\n', 'graph TD\n  A-->B\n  B-->C\n', 'mmd']
}

for (const theme of ['light', 'dark']) {
  test(`comparison ${theme}`, async ({ app, page }) => {
    mkdirSync(OUT, { recursive: true })
    const dir = mkdtempSync(join(tmpdir(), 'diffbro-render-'))
    await page.setViewportSize({ width: 1280, height: 800 })
    if (theme === 'dark') await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
    await page.mouse.move(1270, 790)
    await page.screenshot({ path: `${OUT}/start-${theme}.png` })

    for (const [name, [left, right, ext]] of Object.entries(PAIRS)) {
      const l = join(dir, `before.${ext}`)
      const r = join(dir, `after.${ext}`)
      writeFileSync(l, left)
      writeFileSync(r, right)
      await clickAppMenuItem(app, 'New Comparison')
      await openSide(app, page, 'left', l)
      if (name === 'text') await page.screenshot({ path: `${OUT}/waiting-${theme}.png` })
      await openSide(app, page, 'right', r)
      await page.waitForTimeout(1200)
      await page.screenshot({ path: `${OUT}/${name}-${theme}.png` })
      if (name === 'text') {
        await setViewOption(page, 'Split view', false)
        await page.waitForTimeout(500)
        await page.screenshot({ path: `${OUT}/inline-${theme}.png` })
        await setViewOption(page, 'Split view', true)
      }
    }
  })
}
