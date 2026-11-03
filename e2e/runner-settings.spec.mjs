import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  test,
  expect,
  firstReadyPage,
  freshUserDataDir,
  launchApp,
  openSettings,
  stubMessageBox,
  stubOpenDialog
} from './fixtures.mjs'

test.skip(process.platform === 'win32', 'the fake interpreters are shell scripts')

function fakeProgram(answer) {
  const dir = mkdtempSync(join(tmpdir(), 'runner-fake-'))
  const file = join(dir, 'interpreter')
  writeFileSync(file, `#!/bin/sh\necho "${answer}"\n`)
  chmodSync(file, 0o755)
  return { dir, file }
}

async function openIntegrations(page) {
  await openSettings(page)
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await dialog.getByRole('button', { name: 'Integrations', exact: true }).click()
  return dialog
}
const row = (dialog, name) => dialog.locator('.lang-row', { hasText: name })

test('Claude lives under Integrations, with no subheading or description', async ({ page }) => {
  await openSettings(page)
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await expect(dialog.getByRole('button', { name: 'Claude', exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Integrations', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Languages', exact: true })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Claude', exact: true })).toBeVisible()
  await expect(dialog.getByText('Claude connection', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText(/Let a Claude app/)).toHaveCount(0)
  await expect(dialog.getByRole('checkbox', { name: 'Enable Claude MCP connection' })).toBeVisible()
})

test('every language starts off', async ({ page }) => {
  const dialog = await openIntegrations(page)
  await expect(row(dialog, 'PHP').getByRole('checkbox')).not.toBeChecked()
  await expect(row(dialog, 'Python').getByRole('checkbox')).not.toBeChecked()
  await expect(row(dialog, 'PHP').getByRole('button', { name: 'Change…' })).toHaveCount(0)
})

test('enabling asks in main, then takes the program you pick', async ({ app, page }) => {
  const program = fakeProgram('PHP 8.3.6 (cli)')
  try {
    await stubMessageBox(app, 1)
    await stubOpenDialog(app, program.file)
    const dialog = await openIntegrations(page)
    await row(dialog, 'PHP').getByRole('checkbox').check()
    await expect(row(dialog, 'PHP').getByRole('checkbox')).toBeChecked()
    await expect(row(dialog, 'PHP')).toContainText(program.file)
    await expect(row(dialog, 'PHP')).toContainText('8.3.6')
    await expect(row(dialog, 'PHP').getByRole('button', { name: 'Change…' })).toBeEnabled()
  } finally {
    rmSync(program.dir, { recursive: true, force: true })
  }
})

test('cancelling leaves the language off, and the box unticked', async ({ app, page }) => {
  await stubMessageBox(app, 0)
  const dialog = await openIntegrations(page)
  await row(dialog, 'Python').getByRole('checkbox').click()
  await expect(row(dialog, 'Python').getByRole('checkbox')).not.toBeChecked()
  await expect(row(dialog, 'Python').getByRole('button', { name: 'Change…' })).toHaveCount(0)
})

test('a program that is not that language is turned away, and says so', async ({ app, page }) => {
  const program = fakeProgram('Python 3.12.1')
  try {
    await stubMessageBox(app, 1)
    await stubOpenDialog(app, program.file)
    const dialog = await openIntegrations(page)
    await row(dialog, 'PHP').getByRole('checkbox').click()
    await expect(row(dialog, 'PHP').getByRole('checkbox')).not.toBeChecked()
    await expect(dialog.getByText("That program isn't PHP.")).toBeVisible()
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

test('a language stays on across a relaunch, and off when turned off', async () => {
  const program = fakeProgram('Python 3.12.1')
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  try {
    let page = await firstReadyPage(app)
    await stubMessageBox(app, 1)
    await stubOpenDialog(app, program.file)
    let dialog = await openIntegrations(page)
    await row(dialog, 'Python').getByRole('checkbox').check()
    await expect(row(dialog, 'Python')).toContainText('3.12.1')
    await app.close()

    app = await launchApp(dir)
    page = await firstReadyPage(app)
    dialog = await openIntegrations(page)
    await expect(row(dialog, 'Python').getByRole('checkbox')).toBeChecked()
    await row(dialog, 'Python').getByRole('checkbox').uncheck()
    await expect(row(dialog, 'Python').getByRole('button', { name: 'Change…' })).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(program.dir, { recursive: true, force: true })
  }
})
