import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  newSnippetButton,
  openSettings
} from './fixtures.mjs'

// A tag word sits next to the name on every saved-diff and snippet row. For a
// library where nearly everything carries the same two tags that is noise beside
// the one thing being read — the name — so it can be turned off. Tags themselves
// are untouched: the shelf still filters and the search still finds by them.

const TOGGLE = 'Show tags on sidebar rows'
const snippetTag = (page) => page.locator('.snippets-section .row .tag-word')
const diffTag = (page) => page.locator('li.diff .tag-word')

async function seedSnippet(page, name, tags) {
  await newSnippetButton(page).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type('seeded body')
  for (const tag of tags) {
    await editor.getByPlaceholder('add a tag…').fill(tag)
    await editor.getByPlaceholder('add a tag…').press('Enter')
  }
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

async function seedDiff(page, name, tags) {
  const left = page.getByPlaceholder('Paste original text here')
  if (!(await left.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Paste mode' }).click()
  }
  await left.fill(`before ${name}`)
  await page.getByPlaceholder('Paste changed text here').fill(`after ${name}`)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  for (const tag of tags) {
    await dialog.getByPlaceholder('add a tag…').fill(tag)
    await dialog.getByPlaceholder('add a tag…').press('Enter')
  }
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('li.diff', { hasText: name })).toBeVisible()
}

async function setRowTags(page, on) {
  await openSettings(page)
  const toggle = page.getByText(TOGGLE)
  await expect(toggle).toBeVisible()
  const box = page.locator('.setting-toggle', { hasText: TOGGLE }).locator('input')
  if ((await box.isChecked()) !== on) await box.click()
  await expect(box).toBeChecked({ checked: on })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden()
}

test('the toggle takes the tag word off both kinds of row, and puts it back', async ({ page }) => {
  test.setTimeout(120_000)
  await seedSnippet(page, 'Rollback runbook', ['ops'])
  await seedDiff(page, 'E2E tagged diff', ['ops'])

  await expect(snippetTag(page).first()).toBeVisible()
  await expect(diffTag(page).first()).toBeVisible()

  await setRowTags(page, false)
  await expect(snippetTag(page)).toHaveCount(0)
  await expect(diffTag(page)).toHaveCount(0)
  // The name is what the row is for, and it is still there.
  await expect(page.locator('.snippets-section .row', { hasText: 'Rollback runbook' })).toBeVisible()

  await setRowTags(page, true)
  await expect(snippetTag(page).first()).toBeVisible()
  await expect(diffTag(page).first()).toBeVisible()
})

// Hiding the WORD is not hiding the tag: both ways of reaching one still work,
// which is the whole reason the row can afford to drop it.
test('the shelf and the search still filter by tag with the words off', async ({ page }) => {
  test.setTimeout(120_000)
  await seedSnippet(page, 'Rollback runbook', ['ops'])
  await seedSnippet(page, 'Untagged note', [])
  await setRowTags(page, false)

  const chip = page.locator('.usb-tag', { hasText: 'ops' }).first()
  await expect(chip).toBeVisible()
  await chip.click()
  await expect(page.locator('.snippets-section .row', { hasText: 'Rollback runbook' })).toBeVisible()
  await expect(page.locator('.snippets-section .row', { hasText: 'Untagged note' })).toHaveCount(0)
  await chip.click()

  await page.getByPlaceholder('Search diffs & snippets…').fill('ops')
  await expect(page.locator('.snippets-section .row', { hasText: 'Rollback runbook' })).toBeVisible()
  await expect(page.locator('.snippets-section .row', { hasText: 'Untagged note' })).toHaveCount(0)
})

test('the choice survives a relaunch', async () => {
  test.setTimeout(120_000)
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  try {
    const page = await firstReadyPage(app)
    await seedSnippet(page, 'Rollback runbook', ['ops'])
    await setRowTags(page, false)
  } finally {
    await app.close()
  }

  app = await launchApp(dir)
  try {
    const page = await firstReadyPage(app)
    await expect(page.locator('.snippets-section .row', { hasText: 'Rollback runbook' })).toBeVisible()
    await expect(snippetTag(page)).toHaveCount(0)
  } finally {
    await app.close()
  }
})
