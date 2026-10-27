import { test, expect, showPanel } from './fixtures.mjs'

// The exit is a key press, and only a launch has the keyboard and the layout.

async function loadDiff(page) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill('one\ntwo\nthree')
  await page.getByPlaceholder('Paste changed text here').fill('one\ntwo CHANGED\nthree')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('What are you comparing?')).toBeHidden()
}

const chrome = (page) => ({
  toolbar: page.locator('.app > .toolbar'),
  sidebar: page.locator('.saved'),
  tabs: page.locator('.diff-tabs')
})

test('presentation mode hides every other surface and Escape brings them back', async ({
  page
}) => {
  await loadDiff(page)
  const { toolbar, sidebar, tabs } = chrome(page)
  await expect(toolbar).toBeVisible()
  await expect(sidebar).toBeVisible()

  await page.getByTestId('toolbar-present').click()

  await expect(toolbar).toBeHidden()
  await expect(sidebar).toBeHidden()
  await expect(tabs).toBeHidden()
  // The comparison is what is left, and it takes the window.
  const diff = page.locator('.content')
  await expect(diff).toBeVisible()
  const { paneLeft, winWidth } = await page.evaluate(() => ({
    paneLeft: Math.round(document.querySelector('.pane').getBoundingClientRect().left),
    winWidth: window.innerWidth
  }))
  expect(paneLeft).toBe(0)
  expect(
    await page.evaluate(() =>
      Math.round(document.querySelector('.pane').getBoundingClientRect().width)
    )
  ).toBe(winWidth)

  await page.keyboard.press('Escape')
  await expect(toolbar).toBeVisible()
  await expect(sidebar).toBeVisible()
  await expect(diff).toBeVisible()
})

test('the presentation button is not offered with nothing to present', async ({ page }) => {
  await expect(page.getByTestId('toolbar-present')).toHaveCount(0)
})

// Escape's precedence over a dialog is proved in usePresentationKeys.test.js:
// with the chrome hidden there is no clickable way to raise one here.

// The preload round-trip is the part only a launch proves. Not asserted: the
// fixture's windows are hidden, so their full-screen state means nothing.
test('the window full-screen state is readable and settable from the renderer', async ({
  page
}) => {
  const before = await page.evaluate(() => window.api.isFullScreen())
  expect(typeof before).toBe('boolean')
  const after = await page.evaluate(() => window.api.setFullScreen(false))
  expect(typeof after).toBe('boolean')
})

const exitButton = (page) => page.getByRole('button', { name: 'Exit presentation mode' })

test('presenting shows only the comparison, with an Exit button that leaves', async ({ page }) => {
  await loadDiff(page)
  await page.getByTestId('toolbar-present').click()
  await expect(page.locator('.file-slots-row')).toBeHidden()
  const exit = exitButton(page)
  await expect(exit).toBeVisible()
  await exit.click()
  await expect(page.locator('.app > .toolbar')).toBeVisible()
  await expect(exit).toHaveCount(0)
})

test('a snippet tab can be presented: its content only', async ({ page }) => {
  await showPanel(page, 'snippets')
  await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
  const doc = page.getByRole('region', { name: 'Snippet', exact: true })
  await expect(doc).toBeVisible()

  const present = page.getByTestId('toolbar-present')
  await expect(present).toBeEnabled()
  await present.click()

  await expect(page.locator('.app > .toolbar')).toBeHidden()
  await expect(page.locator('.diff-tabs')).toBeHidden()
  await expect(doc.locator('.doc-head')).toBeHidden()
  await expect(doc.locator('.editor-header')).toBeHidden()
  await expect(doc.locator('.editor-status')).toBeHidden()
  await expect(doc.locator('.monaco-editor')).toBeVisible()
  await expect(exitButton(page)).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(doc.locator('.doc-head')).toBeVisible()
})
