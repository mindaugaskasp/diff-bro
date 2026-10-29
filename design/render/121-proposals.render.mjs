import {
  test,
  expect,
  showPanel,
  openNewSnippet,
  docActions,
  clickAppMenuItem
} from '../../e2e/fixtures.mjs'
import { installKit } from './kit.mjs'
import { NAMES, overlay121 } from './overlays/121.mjs'

// #121: Claude proposals in their panel, nested tag sections, search by tag.
const OUT = 'design/render/out/121'
const STATES = [
  'rest',
  'volume',
  'selecting',
  'open',
  'accepted',
  'discarded',
  'diffs',
  'typing',
  'refused',
  'search',
  'hash',
  'scoped'
]

async function createSnippet(page, name, body) {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type(body)
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

async function paste(page, left, right) {
  await page
    .locator('.diff-tabs')
    .getByRole('button', { name: 'New comparison', exact: true })
    .click()
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill(left)
  await page.getByPlaceholder('Paste or type the changed text').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.diff-container')).toBeVisible()
}

const themeOf = (page) => page.evaluate(() => document.documentElement.dataset.theme)
async function ensureTheme(app, page, theme) {
  if ((await themeOf(page)) !== theme) await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
  await expect.poll(() => themeOf(page)).toBe(theme)
}

async function prepare(page, state) {
  if (state === 'diffs') {
    await showPanel(page, 'diffs')
    await paste(
      page,
      'replicas: 3\nimage: api:1.41\nenv: production\nlog_level: warn',
      'replicas: 3\nimage: api:1.42\nenv: production\nlog_level: debug'
    )
  }
  await showPanel(page, 'snippets')
  await page.locator('li.row').first().waitFor()
  await page.evaluate(() => window.dk.keepRowTemplate())
  if (state === 'diffs') await showPanel(page, 'diffs')
  if (['open', 'typing', 'refused'].includes(state)) {
    await openNewSnippet(page)
    const ed = page.getByRole('region', { name: 'New snippet' })
    await ed.getByPlaceholder('Snippet name…').fill('Rollback')
    await ed.locator('.editor').click()
    await page.keyboard.type(
      '# Roll the api deployment back one revision\nkubectl rollout undo deployment/api'
    )
  }
  if (state === 'accepted') {
    await createSnippet(page, 'Rollback', 'kubectl rollout undo deployment/api')
    await page.locator('li.row', { hasText: 'Rollback' }).locator('.entry').click()
  }
  if (['rest', 'volume', 'selecting', 'discarded', 'search', 'hash', 'scoped'].includes(state)) {
    await page.locator('li.row', { hasText: 'Restart api' }).locator('.entry').click()
  }
}

for (const theme of ['light', 'dark']) {
  test(`121 ${theme}`, async ({ app, page }) => {
    await page.setViewportSize({ width: 1280, height: 760 })
    await createSnippet(page, 'Restart api', 'kubectl rollout restart deployment/api')
    await createSnippet(page, 'Drain a node', 'kubectl drain node-1 --ignore-daemonsets')
    for (const state of STATES) {
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(600)
      await ensureTheme(app, page, theme)
      await page.evaluate(installKit)
      await prepare(page, state)
      await page.waitForTimeout(500)
      await ensureTheme(app, page, theme)
      await page.mouse.move(1270, 750)
      await page.evaluate(overlay121, { state, names: NAMES })
      await page.waitForTimeout(250)
      await page.screenshot({ path: `${OUT}/${theme}-${state}.png` })
    }
  })
}
