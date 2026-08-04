import { readFileSync } from 'node:fs'
import { test, expect, openMenu, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'

// The clipboard is the one thing only a real launch exercises — it is why
// window.api.copyText exists at all (a trusted-click navigator.clipboard write
// hits the deny-all permission handler). Copy as file adds the WRITE side of the
// file flavours; the read side already ships, which makes it the right oracle:
// what we put on the clipboard must decode back through clipboardFilePaths.
// main is bundled to a single file, so the app cannot import a module by path.
// Read the raw flavours out and decode them here — still the real OS clipboard,
// still the write side under test.
const readBackPaths = async (app) => {
  const raw = await app.evaluate(({ clipboard }) => {
    const read = (f) => {
      try {
        return clipboard.readBuffer(f)?.toString('utf8') ?? ''
      } catch {
        return ''
      }
    }
    return {
      plist: read('NSFilenamesPboardType'),
      uris: read('text/uri-list'),
      gnome: read('x-special/gnome-copied-files')
    }
  })
  const fromPlist = [...raw.plist.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) => m[1])
  const fromUris = `${raw.uris}\n${raw.gnome}`
    .split(/\r?\n/)
    .filter((l) => l.startsWith('file://'))
    .map((l) => decodeURIComponent(l.slice('file://'.length)))
  return [...new Set([...fromPlist, ...fromUris])].filter(Boolean)
}

const supported = (page) => page.evaluate(() => window.api.canCopyAsFile())

// Mirrors e2e/secret-snippet.spec.mjs — Monaco needs typed input, not fill().
// Saving lands on the read-only VIEW, which is where the copy pair lives.
async function addSnippet(page, { name, body, secret = false }) {
  await page.getByRole('button', { name: 'New snippet' }).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await editor.locator('.editor').click()
  await page.keyboard.type(body)
  if (secret) await editor.locator('.secret-toggle input[type="checkbox"]').check()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  const view = page.getByRole('dialog', { name: 'Snippet', exact: true })
  await expect(view).toBeVisible()
  return view
}

test('copying a snippet as a file puts a real file on the clipboard', async ({ app, page }) => {
  test.skip(!(await supported(page)), 'this platform cannot carry a file on the clipboard')

  const view = await addSnippet(page, { name: 'E2E copy target', body: 'alpha' })
  await view.getByRole('button', { name: 'Copy as file' }).click()

  const paths = await readBackPaths(app)
  expect(paths).toHaveLength(1)
  expect(paths[0]).toMatch(/E2E-copy-target\.\w+$/)
  // The bytes are the snippet's, so what pastes is the snippet and not its name.
  expect(readFileSync(paths[0], 'utf-8')).toContain('alpha')
})

test('copy content puts text, and no file, on the clipboard', async ({ app, page }) => {
  const view = await addSnippet(page, { name: 'E2E text only', body: 'just text' })
  await view.getByRole('button', { name: 'Copy', exact: true }).click()

  const text = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(text).toBe('just text')
  expect(await readBackPaths(app)).toEqual([])
})

// A staged file is plaintext on disk, which is exactly what "secret" promises
// not to do. Copy content still works — a text clipboard is volatile.
test('a secret snippet offers Copy content but never Copy as file', async ({ page }) => {
  test.skip(!(await supported(page)), 'this platform cannot carry a file on the clipboard')

  const view = await addSnippet(page, { name: 'E2E secret', body: 'sk-live-xxxx', secret: true })
  await expect(view.getByRole('button', { name: 'Copy', exact: true })).toBeVisible()
  await expect(view.getByRole('button', { name: 'Copy as file' })).toBeDisabled()
})

test('copying the diff as a file writes a patch, not the diff text', async ({ app, page }) => {
  test.skip(!(await supported(page)), 'this platform cannot carry a file on the clipboard')

  const left = page.getByPlaceholder('Paste original text here')
  if (!(await left.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Paste text' }).click()
  }
  await left.fill('one\ntwo\n')
  await page.getByPlaceholder('Paste changed text here').fill('one\nTWO\n')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()

  // Through the menu, which is what a reader actually reaches for and what
  // menu-actions.spec.mjs already proves is wired.
  await openMenu(page, 'Edit', 'Copy Diff as File')

  await expect
    .poll(async () => (await readBackPaths(app)).length, { timeout: 10_000 })
    .toBeGreaterThan(0)
  const [path] = await readBackPaths(app)
  expect(path).toMatch(/\.patch$/)
  const patch = readFileSync(path, 'utf-8')
  expect(patch).toContain('-two')
  expect(patch).toContain('+TWO')
})

// Staged copies are plaintext outside the vault, so they must not outlive the
// session. The sweep runs on will-quit and again on next launch.
const isGone = (path) => {
  try {
    readFileSync(path, 'utf-8')
    return 'present'
  } catch {
    return 'gone'
  }
}

test('the quit sweep removes staged plaintext', async ({ app, page }) => {
  test.skip(!(await supported(page)), 'this platform cannot carry a file on the clipboard')

  const view = await addSnippet(page, { name: 'E2E ephemeral', body: 'transient' })
  await view.getByRole('button', { name: 'Copy as file' }).click()
  const [staged] = await readBackPaths(app)
  expect(readFileSync(staged, 'utf-8')).toBe('transient')

  await app.evaluate(({ app: electronApp }) => electronApp.emit('will-quit'))
  await expect.poll(() => isGone(staged)).toBe('gone')
})

// The LAUNCH sweep is the half that exists because a crash SKIPS will-quit, so
// it can only be proven by an actual relaunch — which this test's predecessor
// claimed in its name and did not do.
test('staged plaintext does not survive a relaunch that skipped the quit sweep', async () => {
  test.setTimeout(90_000)
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  const page = await firstReadyPage(app)
  test.skip(!(await supported(page)), 'this platform cannot carry a file on the clipboard')

  let staged
  try {
    const view = await addSnippet(page, { name: 'E2E crash victim', body: 'plaintext' })
    await view.getByRole('button', { name: 'Copy as file' }).click()
    await expect.poll(async () => (await readBackPaths(app)).length).toBeGreaterThan(0)
    ;[staged] = await readBackPaths(app)
    expect(readFileSync(staged, 'utf-8')).toBe('plaintext')
  } finally {
    // Closed without will-quit: this IS the crash the launch sweep is for.
    await app.close()
  }
  expect(isGone(staged)).toBe('present')

  app = await launchApp(dir)
  try {
    await firstReadyPage(app)
    await expect.poll(() => isGone(staged)).toBe('gone')
  } finally {
    await app.close()
  }
})
