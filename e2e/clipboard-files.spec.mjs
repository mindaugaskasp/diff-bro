import { test, expect } from './fixtures.mjs'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Copying files in the file manager puts a file list on the clipboard AND a
// plain-text flavour holding just their names. Reading only the text pasted
// "a.txt\nb.txt" into the editor instead of opening the files.
function twoFiles() {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-clip-'))
  const left = join(dir, 'alpha.txt')
  const right = join(dir, 'beta.txt')
  writeFileSync(left, 'one\ntwo\nthree\n')
  writeFileSync(right, 'one\nTWO\nthree\n')
  return { left, right }
}

// Electron exposes the OS clipboard flavours; text/uri-list is what X11 uses.
const copyFiles = (app, paths) =>
  app.evaluate(
    ({ clipboard }, uris) => {
      clipboard.clear()
      clipboard.write({ text: uris.map((u) => u.split('/').pop()).join('\n') })
      clipboard.writeBuffer('text/uri-list', Buffer.from(uris.join('\r\n') + '\r\n'))
    },
    paths.map((p) => `file://${p}`)
  )

test('pasting two copied files compares them as files, not their names', async ({ app, page }) => {
  const { left, right } = twoFiles()
  await copyFiles(app, [left, right])

  await page.keyboard.press('ControlOrMeta+v')

  // Copied files are unambiguous, so they load straight away — asking
  // "paste text?" first is a prompt about something the user did not do.
  await expect(page.getByRole('dialog', { name: 'Paste detected' })).toBeHidden()

  // Both slots name the real files, and the diff renders their contents.
  await expect(page.locator('.file-slots-row')).toContainText('alpha.txt')
  await expect(page.locator('.file-slots-row')).toContainText('beta.txt')
  await expect(page.getByText('Choose or drop two files to compare.')).toBeHidden()
})

test('pasting one copied file fills the first free side', async ({ app, page }) => {
  const { left } = twoFiles()
  await copyFiles(app, [left])

  await page.keyboard.press('ControlOrMeta+v')

  // Copied files are unambiguous, so they load straight away — asking
  // "paste text?" first is a prompt about something the user did not do.
  await expect(page.getByRole('dialog', { name: 'Paste detected' })).toBeHidden()
  await expect(page.locator('.file-slots-row')).toContainText('alpha.txt')
})

test('pasting plain text still enters paste mode', async ({ app, page }) => {
  await app.evaluate(({ clipboard }) => {
    clipboard.clear()
    clipboard.writeText('just some text')
  })
  await page.keyboard.press('ControlOrMeta+v')
  const confirm = page.getByRole('dialog', { name: 'Paste detected' })
  if (await confirm.isVisible().catch(() => false)) {
    await confirm
      .getByRole('button', { name: /paste|compare|yes/i })
      .first()
      .click()
  }
  await expect(page.getByPlaceholder('Paste original text here')).toHaveValue('just some text')
})
