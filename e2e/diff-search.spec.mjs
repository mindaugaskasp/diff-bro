import { test, expect } from './fixtures.mjs'

// Searching a pane is Monaco's own find widget. The hand-rolled row that used
// to sit above the diff duplicated it and was always on screen; these tests pin
// the behaviour we now rely on Monaco for — per pane, collapsed until asked
// for, and dismissed with Escape (Cmd+F re-focuses the box rather than closing
// it, which is what VS Code and every browser do).

async function pasteCompare(page, left, right) {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()
}

const pane = (page, side) => page.locator(`.editor.${side}`)
const findWidget = (page, side) => pane(page, side).locator('.find-widget.visible')

async function openFind(page, side) {
  await pane(page, side).locator('.view-line').first().click()
  await page.keyboard.press('ControlOrMeta+f')
}

test('the diff opens with no search on screen', async ({ page }) => {
  await pasteCompare(page, 'apple\napple pie', 'pear')
  // Nothing above the panes, and no widget until it is asked for.
  await expect(page.locator('.diff-viewer .search')).toHaveCount(0)
  await expect(findWidget(page, 'original')).toHaveCount(0)
  await expect(findWidget(page, 'modified')).toHaveCount(0)
})

test('find opens in the pane you are in, and only that one', async ({ page }) => {
  await pasteCompare(page, 'apple\napple pie\napple sauce', 'pear')

  await openFind(page, 'original')
  await expect(findWidget(page, 'original')).toBeVisible()
  await expect(findWidget(page, 'modified')).toHaveCount(0)
})

test('it counts matches and steps through them', async ({ page }) => {
  await pasteCompare(page, 'apple\napple pie\napple sauce', 'pear')
  await openFind(page, 'original')

  const widget = findWidget(page, 'original')
  await widget.locator('textarea, input').first().fill('apple')
  await expect(widget.locator('.matchesCount')).toContainText('1 of 3')

  await page.keyboard.press('Enter')
  await expect(widget.locator('.matchesCount')).toContainText('2 of 3')
})

test('escape leaves search mode', async ({ page }) => {
  await pasteCompare(page, 'apple\napple pie', 'pear')
  await openFind(page, 'original')
  await expect(findWidget(page, 'original')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(findWidget(page, 'original')).toHaveCount(0)
})

// The widget floats over the diff, so it would otherwise land in an exported
// picture the way the toast and the shortcut bar once did.
test('the find widget is kept out of an exported image', async ({ page }) => {
  await pasteCompare(page, 'apple\napple pie', 'pear')
  await openFind(page, 'original')
  await expect(findWidget(page, 'original')).toBeVisible()

  const shown = await page.evaluate(() => {
    const content = document.querySelector('.content')
    const seen = () => {
      const el = document.querySelector('.monaco-editor .find-widget')
      return el ? getComputedStyle(el).display !== 'none' : null
    }
    const before = seen()
    content.classList.add('capturing')
    const during = seen()
    content.classList.remove('capturing')
    return { before, during }
  })
  expect(shown.before).toBe(true)
  expect(shown.during).toBe(false)
})
