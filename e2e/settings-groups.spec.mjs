import { test, expect, openMenu, openSettings, openSettingsPage } from './fixtures.mjs'

const dialogOf = (page) => page.getByRole('dialog', { name: 'Settings' })
const groupRow = (page, name) =>
  dialogOf(page).locator('.settings-nav').getByRole('button', { name, exact: true })
const pageItem = groupRow

test('groups fold and unfold, and the open group follows the page', async ({ page }) => {
  await openSettings(page)
  await expect(groupRow(page, 'General')).toHaveAttribute('aria-expanded', 'true')
  await expect(groupRow(page, 'Integrations')).toHaveAttribute('aria-expanded', 'false')
  await expect(groupRow(page, 'Data')).toHaveAttribute('aria-expanded', 'false')
  await expect(pageItem(page, 'Appearance')).toHaveAttribute('aria-current', 'page')
  await expect(pageItem(page, 'Storage')).toHaveCount(0)

  await groupRow(page, 'Data').click()
  await expect(pageItem(page, 'Storage')).toHaveAttribute('aria-current', 'page')
  await expect(dialogOf(page).getByRole('heading', { name: 'Data folder' })).toBeVisible()
  await expect(groupRow(page, 'Data')).toHaveAttribute('aria-expanded', 'true')
  await expect(groupRow(page, 'General')).toHaveAttribute('aria-expanded', 'false')
  await expect(pageItem(page, 'Appearance')).toHaveCount(0)

  await groupRow(page, 'Data').click()
  await expect(groupRow(page, 'Data')).toHaveAttribute('aria-expanded', 'false')
  await expect(pageItem(page, 'Storage')).toHaveCount(0)
  await expect(dialogOf(page).getByRole('heading', { name: 'Data folder' })).toBeVisible()

  await groupRow(page, 'Data').click()
  await pageItem(page, 'Logs').click()
  await groupRow(page, 'Data').click()
  await groupRow(page, 'Data').click()
  await expect(pageItem(page, 'Logs')).toHaveAttribute('aria-current', 'page')
  await expect(groupRow(page, 'Integrations').locator('.nav-chevron')).toBeVisible()
})

test('a child page sits indented under its group, at the small control height', async ({
  page
}) => {
  await openSettings(page)
  const group = await groupRow(page, 'General').locator('.nav-label').boundingBox()
  const child = await pageItem(page, 'Behaviour').locator('.nav-label').boundingBox()
  const childBox = await pageItem(page, 'Behaviour').boundingBox()
  expect(Math.round(child.x - group.x)).toBe(22)
  expect(Math.round(childBox.height)).toBe(26)
})

const CONTENT = {
  Appearance: (d) => d.getByRole('button', { name: 'Use the Light theme' }),
  Behaviour: (d) => d.getByText('Show tags on sidebar rows'),
  Tours: (d) => d.getByRole('heading', { name: 'Tours', exact: true }),
  Shortcuts: (d) => d.getByRole('heading', { name: 'Quick look-up' }),
  Languages: (d) => d.getByRole('heading', { name: 'Languages', exact: true }),
  Claude: (d) => d.getByRole('checkbox', { name: 'Enable Claude MCP connection' }),
  Terminal: (d) => d.locator('.cli-list'),
  Email: (d) => d.locator('.email-settings'),
  Storage: (d) => d.getByRole('heading', { name: 'Data folder' }),
  Limits: (d) => d.getByText('Max Spreadsheet (.xlsx) file (MB)'),
  Logs: (d) => d.getByRole('heading', { name: 'Logs' })
}

test('every former tab is reachable as a page', async ({ page }) => {
  for (const [name, content] of Object.entries(CONTENT)) {
    const dialog = await openSettingsPage(page, name)
    await expect(content(dialog), name).toBeVisible()
  }
})

test('the Behaviour page holds the sound and window switches', async ({ page }) => {
  const dialog = await openSettingsPage(page, 'Behaviour')
  await expect(dialog.getByText('Play a shutter sound when a diff image is captured')).toBeVisible()
  await expect(dialog.getByText(/^Maximize tool & snippet windows/)).toBeVisible()
})

test("Fun's switch lives in Appearance and the Fun page is gone", async ({ page }) => {
  const dialog = await openSettingsPage(page, 'Appearance')
  const toggle = dialog.locator('.setting-toggle', { hasText: 'Rotate the app theme daily' })
  await expect(toggle).toBeVisible()
  await expect(dialog.getByText(/When off, Diff Bro uses the theme you picked/)).toBeVisible()
  await toggle.locator('input').check()
  await expect(toggle.locator('input')).toBeChecked()

  for (const group of ['General', 'Integrations', 'Data']) {
    if ((await groupRow(page, group).getAttribute('aria-expanded')) !== 'true') {
      await groupRow(page, group).click()
    }
    await expect(dialog.getByRole('button', { name: 'Fun', exact: true })).toHaveCount(0)
  }
})

test('Desktop is a General page on Windows only', async ({ page }) => {
  await openSettings(page)
  await expect(pageItem(page, 'Shortcuts')).toBeVisible()
  await expect(pageItem(page, 'Desktop')).toHaveCount(process.platform === 'win32' ? 1 : 0)
})

test('the Terminal command lands on Terminal with Integrations open', async ({ page }) => {
  await openMenu(page, 'Help', 'Terminal Commands & Setup')
  await expect(dialogOf(page)).toBeVisible()
  await expect(pageItem(page, 'Terminal')).toHaveAttribute('aria-current', 'page')
  await expect(groupRow(page, 'Integrations')).toHaveAttribute('aria-expanded', 'true')
  await expect(groupRow(page, 'General')).toHaveAttribute('aria-expanded', 'false')
  await expect(dialogOf(page).locator('.cli-list')).toBeVisible()
})
