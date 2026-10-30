import {
  test,
  expect,
  stubOpenDialog,
  paneLabel,
  openSide,
  setViewOption,
  showPanel
} from './fixtures.mjs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir
const file = (name, text) => {
  const path = join(dir, name)
  writeFileSync(path, text)
  return path
}
test.beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'diffbro-noslots-'))))
test.afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function loadPair(app, page) {
  await openSide(app, page, 'left', file('alpha.txt', 'one\ntwo\n'))
  await openSide(app, page, 'right', file('beta.txt', 'one\nTWO\n'))
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()
}

const halfOf = async (page, locator) => {
  const content = await page.locator('main.content').boundingBox()
  const box = await locator.boundingBox()
  return box.x + box.width / 2 < content.x + content.width / 2 ? 'left' : 'right'
}

test('a comparison has no slot band and no hint bar; each half names its file', async ({
  app,
  page
}) => {
  await loadPair(app, page)
  await expect(page.locator('.file-slots-row')).toHaveCount(0)
  await expect(page.locator('.shortcut-bar')).toHaveCount(0)
  await expect(paneLabel(page, 'left')).toHaveText('alpha.txt')
  await expect(paneLabel(page, 'right')).toHaveText('beta.txt')
  expect(await halfOf(page, paneLabel(page, 'left'))).toBe('left')
  expect(await halfOf(page, paneLabel(page, 'right'))).toBe('right')
  await expect(paneLabel(page, 'left')).toHaveAttribute('data-tip', join(dir, 'alpha.txt'))
  const footer = await page.locator('.status-band').boundingBox()
  expect(footer.height).toBeLessThanOrEqual(26)
})

test('clicking a pane label replaces that side', async ({ app, page }) => {
  await loadPair(app, page)
  await stubOpenDialog(app, file('gamma.txt', 'one\nthree\n'))
  await paneLabel(page, 'right').click()
  await page
    .getByRole('dialog', { name: 'Replace current comparison?' })
    .getByRole('button', { name: 'Replace anyway' })
    .click()
  await expect(paneLabel(page, 'right')).toHaveText('gamma.txt')
  await expect(paneLabel(page, 'left')).toHaveText('alpha.txt')
})

test('a single-column view names both sides together at the top right', async ({ app, page }) => {
  await loadPair(app, page)
  await setViewOption(page, 'Split view', false)
  const labels = page.locator('.pane-labels')
  await expect(labels).toHaveClass(/joined/)
  await expect(labels).toContainText('alpha.txt')
  await expect(labels).toContainText('beta.txt')
  expect(await halfOf(page, paneLabel(page, 'left'))).toBe('right')
})

test('a snippet dropped on the left half replaces the left side', async ({ app, page }) => {
  await loadPair(app, page)
  await showPanel(page, 'snippets')
  const name = 'Example — Mermaid diagram'
  await page.locator('.snippets-section .row', { hasText: name }).first().hover()
  await page.evaluate((rowName) => {
    const row = [...document.querySelectorAll('.snippets-section .row')].find((r) =>
      r.textContent.includes(rowName)
    )
    const content = document.querySelector('main.content').getBoundingClientRect()
    const at = { clientX: content.left + 40, clientY: content.top + content.height / 2 }
    const target = document.elementFromPoint(at.clientX, at.clientY)
    const dt = new DataTransfer()
    row.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }))
    for (const type of ['dragenter', 'dragover', 'drop'])
      target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, ...at }))
  }, name)
  await expect(paneLabel(page, 'left')).toHaveText(name, { timeout: 15000 })
  await expect(paneLabel(page, 'right')).toHaveText('beta.txt')
})

test('the start is a prompt and three links; the waiting pane labels the loaded side', async ({
  app,
  page
}) => {
  const start = page.locator('.start-surface')
  await expect(start.getByRole('button')).toHaveText(['Two files', 'Pasted text', 'New snippet'])
  await expect(start.locator('kbd, .glyph-well, .start-formats')).toHaveCount(0)

  await openSide(app, page, 'left', file('alpha.txt', 'one\n'))
  await expect(page.locator('.wait-hint')).toHaveText(
    'Drop a file or a snippet here, or click to choose one.'
  )
  await expect(paneLabel(page, 'left')).toHaveText('alpha.txt')
  await expect(paneLabel(page, 'right')).toHaveCount(0)
  expect(await halfOf(page, paneLabel(page, 'left'))).toBe('left')
})

test('on a grid the labels sit above the header row, covering no column letter', async ({
  app,
  page
}) => {
  await openSide(app, page, 'left', file('before.csv', 'id,name,q1,q2,q3\n1,alpha,1,2,3\n'))
  await openSide(app, page, 'right', file('after.csv', 'id,name,q1,q2,q3\n1,alpha,1,2,4\n'))
  await page.locator('.sheet-bar').waitFor()
  const labelBottom = await paneLabel(page, 'left').evaluate(
    (el) => el.getBoundingClientRect().bottom
  )
  const gridTop = await page.locator('.grids').evaluate((el) => el.getBoundingClientRect().top)
  expect(labelBottom).toBeLessThanOrEqual(gridTop)
})
