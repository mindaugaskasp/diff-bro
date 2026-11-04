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
  expectProgram,
  failOpenDialog,
  fakeProgram,
  languageRow as row,
  openLanguages,
  programField
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

test('every language starts off, with the path field and Browse… in the row', async ({ page }) => {
  const dialog = await openLanguages(page)
  const php = row(dialog, 'PHP')
  await expect(php.getByRole('checkbox')).not.toBeChecked()
  await expect(row(dialog, 'Python').getByRole('checkbox')).not.toBeChecked()
  await expect(programField(php)).toHaveValue('')
  await expect(programField(php)).toHaveAttribute('placeholder', 'Found when you turn it on')
  await expect(php.getByRole('button', { name: 'Browse…' })).toBeVisible()
  await expect(php).not.toContainText('Off')
  await expect(php.getByRole('button', { name: 'Change…' })).toHaveCount(0)
  await expect(php.getByRole('spinbutton')).toHaveValue('2')
})

test('off greys the field and Browse… by ink, not opacity', async ({ page }) => {
  const dialog = await openLanguages(page)
  const php = row(dialog, 'PHP')
  const style = (locator) =>
    locator.evaluate((el) => {
      const meta = getComputedStyle(el.closest('.lang-row')).getPropertyValue('--text-meta').trim()
      const probe = document.createElement('span')
      probe.style.color = meta
      el.append(probe)
      const metaColor = getComputedStyle(probe).color
      probe.remove()
      return { color: getComputedStyle(el).color, metaColor, opacity: getComputedStyle(el).opacity }
    })
  for (const control of [programField(php), php.getByRole('button', { name: 'Browse…' })]) {
    const { color, metaColor, opacity } = await style(control)
    expect(color).toBe(metaColor)
    expect(opacity).toBe('1')
  }
})

test('enabling asks in main, then finds the program itself', async ({ app, page }) => {
  test.skip(!PYTHON, 'needs python3 on the machine')
  await stubMessageBox(app, 1)
  await failOpenDialog(app)
  const dialog = await openLanguages(page)
  await row(dialog, 'Python').getByRole('checkbox').check()
  await expect(row(dialog, 'Python').getByRole('checkbox')).toBeChecked()
  await expect(programField(row(dialog, 'Python'))).toHaveValue(/python3$/)
  await expect(row(dialog, 'Python').locator('.lang-version')).toHaveText(/^3\.\d+\.\d+$/)
})

test('Browse… takes the program you pick in main', async ({ app, page }) => {
  const program = fakeProgram('PHP 8.3.6 (cli)')
  try {
    await stubOpenDialog(app, program.file)
    const dialog = await openLanguages(page)
    await row(dialog, 'PHP').getByRole('button', { name: 'Browse…' }).click()
    await expectProgram(row(dialog, 'PHP'), program.file, '8.3.6')
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
  await expect(programField(row(dialog, 'Python'))).toHaveValue('')
})

test('a program that is not that language is turned away, and says so', async ({ app, page }) => {
  const program = fakeProgram('Python 3.12.1')
  try {
    await stubOpenDialog(app, program.file)
    const dialog = await openLanguages(page)
    await row(dialog, 'PHP').getByRole('button', { name: 'Browse…' }).click()
    await expect(dialog.getByText("That program isn't PHP.")).toBeVisible()
    await expect(programField(row(dialog, 'PHP'))).toHaveValue('')
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
    await row(dialog, 'Python').getByRole('button', { name: 'Browse…' }).click()
    await expect(row(dialog, 'Python').locator('.lang-version')).toHaveText('3.12.1')
    await row(dialog, 'Python').getByRole('checkbox').check()
    await expect(row(dialog, 'Python').getByRole('checkbox')).toBeChecked()
    await app.close()

    app = await launchApp(dir)
    page = await firstReadyPage(app)
    dialog = await openLanguages(page)
    await expect(row(dialog, 'Python').getByRole('checkbox')).toBeChecked()
    await row(dialog, 'Python').getByRole('checkbox').uncheck()
    await expectProgram(row(dialog, 'Python'), program.file, '3.12.1')
    await expect(row(dialog, 'Python')).toHaveClass(/is-off/)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(program.dir, { recursive: true, force: true })
  }
})
