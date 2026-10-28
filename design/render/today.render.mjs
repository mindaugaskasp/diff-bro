import {
  test,
  expect,
  showPanel,
  openNewSnippet,
  docActions,
  clickAppMenuItem,
  openMenu
} from '../../e2e/fixtures.mjs'

// Today's app, surface by surface: the baseline every redesign is drawn against.
const OUT = 'design/render/out/today'

async function createSnippet(page, name, body) {
  await openNewSnippet(page)
  const editor = page.getByRole('region', { name: 'New snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type(body)
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

async function compare(page) {
  await page
    .locator('.diff-tabs')
    .getByRole('button', { name: 'New comparison', exact: true })
    .click()
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page
    .getByPlaceholder('Paste or type the original text')
    .fill('replicas: 3\nimage: api:1.41\nenv: production\nlog_level: warn\ntimeout: 30s')
  await page
    .getByPlaceholder('Paste or type the changed text')
    .fill('replicas: 3\nimage: api:1.42\nenv: production\nlog_level: debug\ntimeout: 30s')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.diff-container')).toBeVisible()
}

const themeOf = (page) => page.evaluate(() => document.documentElement.dataset.theme)

const SURFACES = {
  start: async (page) => {
    await page
      .locator('.diff-tabs')
      .getByRole('button', { name: 'New comparison', exact: true })
      .click()
  },
  home: (page) => showPanel(page, 'home'),
  snippets: (page) => showPanel(page, 'snippets'),
  comparison: async (page) => {
    await showPanel(page, 'diffs')
    await compare(page)
  },
  tools: (page) => showPanel(page, 'tools'),
  toolJson: (page) => openMenu(page, 'Tools', 'Format', 'JSON'),
  settings: (page) => page.keyboard.press('Control+,'),
  palette: (page) => page.keyboard.press('Control+Shift+P'),
  keys: (page) => showPanel(page, 'keys')
}

for (const theme of ['light', 'dark']) {
  test(`today ${theme}`, async ({ app, page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await createSnippet(page, 'Restart api', 'kubectl rollout restart deployment/api')
    await createSnippet(
      page,
      'Find slow queries',
      'select query, mean_exec_time from pg_stat_statements order by 2 desc limit 20'
    )
    for (const [name, go] of Object.entries(SURFACES)) {
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(600)
      if ((await themeOf(page)) !== theme) await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
      await expect.poll(() => themeOf(page)).toBe(theme)
      await go(page)
      await page.waitForTimeout(700)
      await page.mouse.move(1270, 790)
      await page.screenshot({ path: `${OUT}/${theme}-${name}.png` })
    }
  })
}
