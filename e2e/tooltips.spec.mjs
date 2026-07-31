import { test, expect } from './fixtures.mjs'

// Tooltips are the app's own (AppTooltip + data-tip), not native `title`: a
// frameless Electron window often never draws `title` at all, which is why the
// search toggles looked unexplained. Only a real launch can show that hovering
// a control actually produces the bubble, so it is checked here.

async function compare(page) {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill('alpha\nbravo')
  await page.getByPlaceholder('Paste changed text here').fill('alpha\nBRAVO')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.diff-container')).toBeVisible()
}

test('the search toggles explain what they do, in the app’s own tooltip', async ({ page }) => {
  await compare(page)

  const opts = page.locator('.search .side').first().locator('label.opt')
  await expect(opts).toHaveCount(3)

  // The glyphs alone say nothing, so each carries an explanation rather than a
  // restatement of its label.
  for (const [i, expected] of [/Match case/, /Whole word/, /Regular expression/].entries()) {
    const tip = await opts.nth(i).getAttribute('data-tip')
    expect(tip).toMatch(expected)
    expect(tip.length).toBeGreaterThan('Match case'.length) // an explanation, not a label
  }

  // Hovering really produces the app's tooltip.
  await opts.first().hover()
  const bubble = page.locator('.tip-bubble')
  await expect(bubble).toBeVisible({ timeout: 5000 })
  await expect(bubble).toContainText('Match case')
})

test('no interactive control is left with an undrawn native title', async ({ page }) => {
  await compare(page)
  // Native `title` on a button or label is the bug this sweep removed: it is the
  // one tooltip the app cannot draw, so it silently shows nothing.
  const stragglers = await page.evaluate(() =>
    [...document.querySelectorAll('button[title], label[title]')].map(
      (el) => `${el.tagName.toLowerCase()}.${el.className} — ${el.getAttribute('title')}`
    )
  )
  expect(stragglers).toEqual([])
})

test('icon-only controls carry both a tooltip and an accessible name', async ({ page }) => {
  await compare(page)
  const nameless = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => !el.textContent.trim()) // nothing but an icon
      .filter((el) => !el.getAttribute('aria-label') && !el.getAttribute('data-tip'))
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
  )
  expect(nameless).toEqual([])
})

// Converting the saved-diff row from native `title` to the app's own tooltip
// changed two things the OS used to handle: the OS hid its tip the moment you
// clicked, and it wrapped long text. Both had to be reproduced here.
async function savedDiffRow(page) {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill('one\ntwo')
  await page.getByPlaceholder('Paste changed text here').fill('one\nTWO')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill('Sidebar tip diff')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  const row = page.locator('li.diff', { hasText: 'Sidebar tip diff' })
  await expect(row).toBeVisible()
  return row
}

test('clicking a sidebar row dismisses its tooltip instead of leaving it stuck', async ({
  page
}) => {
  const row = await savedDiffRow(page)
  const bubble = page.locator('.tip-bubble')

  await row.locator('.stack').hover()
  await expect(bubble).toBeVisible()

  // Opening the diff is an action — the tip has served its purpose and must go,
  // the way the OS-drawn `title` always did.
  await row.locator('.stack').click()
  await expect(bubble).toHaveCount(0)
})

test('a long tooltip stays inside the window', async ({ page }) => {
  const row = await savedDiffRow(page)
  await row.locator('.stack').hover()
  const bubble = page.locator('.tip-bubble')
  await expect(bubble).toBeVisible()

  // This row's tip carries the name AND the data directory, so it is the
  // longest in the app — nowrap with no cap ran it off both screen edges.
  const box = await bubble.boundingBox()
  const width = await page.evaluate(() => window.innerWidth)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
})
