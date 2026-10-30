import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  test,
  expect,
  docActions,
  openNewSnippet,
  showPanel,
  stubOpenDialog,
  stubSaveDialog,
  openMenu,
  markSecret
} from './fixtures.mjs'

const more = (page) => docActions(page).getByRole('button', { name: 'More snippet actions' })

async function newSnippet(page, { name, body, secret = false }) {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('Snippet name…').fill(name)
  await doc.locator('.editor').click()
  await page.keyboard.type(body)
  if (secret) {
    await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
    await markSecret(page, name)
  }
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
    await page.getByRole('menuitem', { name: /Export as file/ }).click()

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
    await openMenu(page, 'File', 'Export', 'Snippet as File')
    await expect.poll(() => readFileSync(out, 'utf-8')).toBe('menu body')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a secret snippet cannot be saved or copied as a file', async ({ page }) => {
  await newSnippet(page, { name: 'Token', body: 'sk-live-xxxx', secret: true })
  await more(page).click()
  await expect(page.getByRole('menuitem', { name: /Export as file/ })).toBeDisabled()
})

function textFile(name, body) {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-open-as-'))
  const path = join(dir, name)
  writeFileSync(path, body)
  return { dir, path }
}

test('File ▸ Open File as Snippet… opens the file as an unsaved snippet tab', async ({
  app,
  page
}) => {
  const { dir, path } = textFile('notes.md', '# heading')
  try {
    await stubOpenDialog(app, path)
    await openMenu(page, 'File', 'Open File as Snippet…')
    const doc = page.getByRole('region', { name: 'New snippet' })
    await expect(doc.getByPlaceholder('Snippet name…')).toHaveValue('notes.md')
    await expect(doc.locator('.view-lines')).toContainText('# heading')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the Snippets panel opens a file as a snippet from its ⋯ menu', async ({ app, page }) => {
  const { dir, path } = textFile('query.sql', 'SELECT 1')
  try {
    await stubOpenDialog(app, path)
    await showPanel(page, 'snippets')
    await page.getByRole('button', { name: 'Snippet library actions' }).click()
    await page.getByRole('menuitem', { name: /Open a text file as a snippet/ }).click()
    await expect(
      page.getByRole('region', { name: 'New snippet' }).getByPlaceholder('Snippet name…')
    ).toHaveValue('query.sql')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
