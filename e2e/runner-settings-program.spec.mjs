import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, firstReadyPage, freshUserDataDir, launchApp, PYTHON } from './fixtures.mjs'
import {
  failOpenDialog,
  fakeProgram,
  languageRow as row,
  messageBoxes,
  openLanguages,
  recordMessageBoxes,
  rememberProgram
} from './runnerPrograms.mjs'

test.skip(process.platform === 'win32', 'the fake interpreters are shell scripts')

async function launchRemembering(languages) {
  const dir = freshUserDataDir()
  rememberProgram(dir, languages)
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)
  return { app, page, dir }
}

test.describe('a language turned off', () => {
  let program
  let session
  test.beforeEach(async () => {
    program = fakeProgram('PHP 8.3.6 (cli)')
    session = await launchRemembering({
      php: { enabled: false, path: program.file, version: '8.3.6' }
    })
  })
  test.afterEach(async () => {
    await session.app.close()
    rmSync(session.dir, { recursive: true, force: true })
    rmSync(program.dir, { recursive: true, force: true })
  })

  test('shows the program it remembers, dimmed, with Change… still there', async () => {
    const dialog = await openLanguages(session.page)
    const php = row(dialog, 'PHP')
    await expect(php.getByRole('checkbox')).not.toBeChecked()
    await expect(php.locator('.lang-path')).toHaveText(`${program.file} · 8.3.6`)
    await expect(php.locator('.lang-path')).toHaveClass(/is-off/)
    await expect(php.getByRole('button', { name: 'Change…' })).toBeEnabled()
  })

  test('turns back on with that program, without asking for it again', async () => {
    await recordMessageBoxes(session.app, 1)
    await failOpenDialog(session.app)
    const dialog = await openLanguages(session.page)
    await row(dialog, 'PHP').getByRole('checkbox').check()
    await expect(row(dialog, 'PHP').getByRole('checkbox')).toBeChecked()
    await expect(row(dialog, 'PHP').locator('.lang-path')).not.toHaveClass(/is-off/)
    await expect(row(dialog, 'PHP').locator('.lang-path')).toHaveText(`${program.file} · 8.3.6`)
    expect(await messageBoxes(session.app)).toHaveLength(1)
  })
})

test.describe('a typed path', () => {
  let program
  test.beforeEach(() => {
    program = fakeProgram('PHP 8.3.6 (cli)')
  })
  test.afterEach(() => rmSync(program.dir, { recursive: true, force: true }))

  async function typePath(page, path) {
    const dialog = await openLanguages(page)
    const php = row(dialog, 'PHP')
    await php.getByRole('button', { name: 'Change…' }).click()
    await php.getByRole('textbox', { name: 'Path to the program' }).fill(path)
    await php.getByRole('button', { name: 'Use', exact: true }).click()
    return php
  }

  test('is confirmed in main, showing the path, then adopted', async ({ app, page }) => {
    await recordMessageBoxes(app, 1)
    const php = await typePath(page, program.file)
    await expect(php.locator('.lang-path')).toHaveText(`${program.file} · 8.3.6`)
    const [confirm] = await messageBoxes(app)
    expect(confirm.detail).toContain(program.file)
    await expect(php.getByRole('checkbox')).not.toBeChecked()
  })

  test('runs nothing when the confirm is cancelled', async ({ app, page }) => {
    await recordMessageBoxes(app, 0)
    const php = await typePath(page, program.file)
    await expect.poll(() => messageBoxes(app)).toHaveLength(1)
    await expect(php.locator('.lang-path')).toHaveText('Off')
    expect(program.wasRun()).toBe(false)
  })

  test('must be a full path, and is refused before any confirm', async ({ app, page }) => {
    await recordMessageBoxes(app, 1)
    const php = await typePath(page, 'php')
    await expect(php.getByText('Type the full path to the program.')).toBeVisible()
    expect(await messageBoxes(app)).toHaveLength(0)
  })

  test('must be a program', async ({ app, page }) => {
    await recordMessageBoxes(app, 1)
    const php = await typePath(page, join(program.dir, 'missing'))
    await expect(php.getByText("There's no program Diff Bro can run at that path.")).toBeVisible()
    expect(await messageBoxes(app)).toHaveLength(0)
  })

  test('must answer as the language', async ({ app, page }) => {
    const python = fakeProgram('Python 3.12.1')
    try {
      await recordMessageBoxes(app, 1)
      const php = await typePath(page, python.file)
      await expect(php.getByText("That program isn't PHP.")).toBeVisible()
      await expect(php.locator('.lang-path')).toHaveText('Off')
    } finally {
      rmSync(python.dir, { recursive: true, force: true })
    }
  })
})

test.describe('detection', () => {
  test.skip(!PYTHON, 'needs python3 on the machine')

  test('replaces a remembered program that is gone, and says so', async () => {
    const gone = '/nonexistent/python3'
    const { app, page, dir } = await launchRemembering({
      python: { enabled: false, path: gone, version: '3.10.0' }
    })
    try {
      await recordMessageBoxes(app, 1)
      await failOpenDialog(app)
      const dialog = await openLanguages(page)
      const python = row(dialog, 'Python')
      await python.getByRole('checkbox').check()
      await expect(python.getByRole('checkbox')).toBeChecked()
      await expect(python.getByRole('status')).toHaveText(
        'The program you had picked is gone, so Diff Bro found this one.'
      )
      await expect(python.locator('.lang-path')).not.toContainText(gone)
    } finally {
      await app.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('lists what it found to switch between, and can look again', async ({ app, page }) => {
    await recordMessageBoxes(app, 1)
    await failOpenDialog(app)
    const dialog = await openLanguages(page)
    const python = row(dialog, 'Python')
    await python.getByRole('checkbox').check()
    await expect(python.getByRole('checkbox')).toBeChecked()
    await python.getByRole('button', { name: 'Change…' }).click()
    const found = python.getByRole('combobox', { name: 'Found on this computer' })
    await expect(found.locator('option').first()).toHaveText(/^3\.\d+\.\d+ · \//)
    const shown = await python.locator('.lang-path').textContent()
    expect(shown).toContain(
      await found.locator('option:checked').evaluate((o) => o.text.split(' · ')[1])
    )
    await python.getByRole('button', { name: 'Find again' }).click()
    await expect(found.locator('option')).not.toHaveCount(0)
    await expect(python.getByRole('alert')).toHaveCount(0)
  })
})
