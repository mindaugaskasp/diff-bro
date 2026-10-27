import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, docActions, openNewSnippet, stubSaveDialog } from './fixtures.mjs'

const more = (page) => docActions(page).getByRole('button', { name: 'More snippet actions' })

async function newSnippet(page, { name, body, secret = false }) {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New Snippet' })
  await doc.getByPlaceholder('Snippet name…').fill(name)
  await doc.locator('.editor').click()
  await page.keyboard.type(body)
  if (secret) await doc.getByRole('checkbox', { name: 'Secret' }).check()
  return doc
}

test('Save as file writes what the tab shows to the path the user picks', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-save-as-'))
  const out = join(dir, 'picked.txt')
  try {
    await newSnippet(page, { name: 'Release notes', body: 'unsaved but on screen' })
    await app.evaluate(({ dialog }, fp) => {
      dialog.showSaveDialog = async (_win, opts) => {
        globalThis.__saveOpts = opts
        return { canceled: false, filePath: fp }
      }
    }, out)
    await more(page).click()
    await page.getByRole('menuitem', { name: /Save as file/ }).click()

    await expect.poll(() => readFileSync(out, 'utf-8')).toBe('unsaved but on screen')
    const opts = await app.evaluate(() => globalThis.__saveOpts)
    expect(opts.defaultPath).toBe('Release-notes.txt')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the File menu saves the snippet in front as a file too', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-save-as-'))
  const out = join(dir, 'menu.txt')
  try {
    await newSnippet(page, { name: 'From the menu', body: 'menu body' })
    await stubSaveDialog(app, out)
    await page.getByRole('button', { name: 'File', exact: true }).click()
    await page.getByText('Save Snippet as File…', { exact: true }).click()
    await expect.poll(() => readFileSync(out, 'utf-8')).toBe('menu body')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a secret snippet cannot be saved or copied as a file', async ({ page }) => {
  await newSnippet(page, { name: 'Token', body: 'sk-live-xxxx', secret: true })
  await more(page).click()
  await expect(page.getByRole('menuitem', { name: /Save as file/ })).toBeDisabled()
})
