import { rmSync } from 'node:fs'
import {
  test,
  expect,
  firstReadyPage,
  freshUserDataDir,
  launchApp,
  openSettingsPage,
  PYTHON,
  stubMessageBox,
  stubOpenDialog
} from './fixtures.mjs'
import {
  failOpenDialog,
  fakeProgram,
  languageRow as row,
  openLanguages
} from './runnerPrograms.mjs'

test.skip(process.platform === 'win32', 'the fake interpreters are shell scripts')

test('Languages and Claude are their own pages under Integrations', async ({ page }) => {
  let dialog = await openLanguages(page)
  await expect(dialog.getByRole('heading', { name: 'Languages', exact: true })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Claude', exact: true })).toHaveCount(0)
  dialog = await openSettingsPage(page, 'Claude')
  await expect(dialog.getByRole('heading', { name: 'Claude', exact: true })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Languages', exact: true })).toHaveCount(0)
  await expect(dialog.getByText('Claude connection', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText(/Let a Claude app/)).toHaveCount(0)
  await expect(dialog.getByRole('checkbox', { name: 'Enable Claude MCP connection' })).toBeVisible()
})

test('every language starts off', async ({ page }) => {
  const dialog = await openLanguages(page)
  await expect(row(dialog, 'PHP').getByRole('checkbox')).not.toBeChecked()
  await expect(row(dialog, 'Python').getByRole('checkbox')).not.toBeChecked()
  await expect(row(dialog, 'PHP').locator('.lang-path')).toHaveText('Off')
})

test('enabling asks in main, then finds the program itself', async ({ app, page }) => {
  test.skip(!PYTHON, 'needs python3 on the machine')
  await stubMessageBox(app, 1)
  await failOpenDialog(app)
  const dialog = await openLanguages(page)
  await row(dialog, 'Python').getByRole('checkbox').check()
  await expect(row(dialog, 'Python').getByRole('checkbox')).toBeChecked()
  await expect(row(dialog, 'Python').locator('.lang-path')).toContainText(/python3 · 3\.\d+\.\d+/)
})

test('Browse… takes the program you pick in main', async ({ app, page }) => {
  const program = fakeProgram('PHP 8.3.6 (cli)')
  try {
    await stubOpenDialog(app, program.file)
    const dialog = await openLanguages(page)
    await row(dialog, 'PHP').getByRole('button', { name: 'Change…' }).click()
    await row(dialog, 'PHP').getByRole('button', { name: 'Browse…' }).click()
    await expect(row(dialog, 'PHP')).toContainText(`${program.file} · 8.3.6`)
    await expect(row(dialog, 'PHP').getByRole('checkbox')).not.toBeChecked()
  } finally {
    rmSync(program.dir, { recursive: true, force: true })
  }
})

test('cancelling leaves the language off, and the box unticked', async ({ app, page }) => {
  await stubMessageBox(app, 0)
  const dialog = await openLanguages(page)
  await row(dialog, 'Python').getByRole('checkbox').click()
  await expect(row(dialog, 'Python').getByRole('checkbox')).not.toBeChecked()
  await expect(row(dialog, 'Python').locator('.lang-path')).toHaveText('Off')
})

test('a program that is not that language is turned away, and says so', async ({ app, page }) => {
  const program = fakeProgram('Python 3.12.1')
  try {
    await stubOpenDialog(app, program.file)
    const dialog = await openLanguages(page)
    await row(dialog, 'PHP').getByRole('button', { name: 'Change…' }).click()
    await row(dialog, 'PHP').getByRole('button', { name: 'Browse…' }).click()
    await expect(dialog.getByText("That program isn't PHP.")).toBeVisible()
    await expect(row(dialog, 'PHP').locator('.lang-path')).toHaveText('Off')
  } finally {
    rmSync(program.dir, { recursive: true, force: true })
  }
})

test('the renderer cannot enable a language through the stores', async ({ page }) => {
  const saved = await page.evaluate(() =>
    window.api.storeSave('runners', JSON.stringify({ languages: { php: { enabled: true } } }))
  )
  expect(saved.error).toBe('bad-request')
})

test('a language stays on across a relaunch, and keeps its program when turned off', async () => {
  const program = fakeProgram('Python 3.12.1')
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  try {
    let page = await firstReadyPage(app)
    await stubMessageBox(app, 1)
    await stubOpenDialog(app, program.file)
    let dialog = await openLanguages(page)
    await row(dialog, 'Python').getByRole('button', { name: 'Change…' }).click()
    await row(dialog, 'Python').getByRole('button', { name: 'Browse…' }).click()
    await expect(row(dialog, 'Python')).toContainText('3.12.1')
    await row(dialog, 'Python').getByRole('checkbox').check()
    await expect(row(dialog, 'Python').getByRole('checkbox')).toBeChecked()
    await app.close()

    app = await launchApp(dir)
    page = await firstReadyPage(app)
    dialog = await openLanguages(page)
    await expect(row(dialog, 'Python').getByRole('checkbox')).toBeChecked()
    await row(dialog, 'Python').getByRole('checkbox').uncheck()
    await expect(row(dialog, 'Python').locator('.lang-path')).toHaveText(`${program.file} · 3.12.1`)
    await expect(row(dialog, 'Python').locator('.lang-path')).toHaveClass(/is-off/)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(program.dir, { recursive: true, force: true })
  }
})
