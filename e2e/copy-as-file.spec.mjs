import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { test, expect, openMenu, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'

// Read the clipboard the way the Windows shell does — the predefined FileDropList
// that Explorer and mail clients paste. This is the format Electron cannot write
// and the PowerShell hand-off does; readBackPaths above only knows the mac/Linux
// flavours, so it can't see it.
const shellDropList = () => {
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-Command',
        'Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }'
      ],
      { encoding: 'utf8' }
    )
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

// The clipboard is the one thing only a real launch exercises — it is why
// window.api.copyText exists at all (a trusted-click navigator.clipboard write
// hits the deny-all permission handler). Copy as file adds the WRITE side of the
// file flavours; the read side already ships, which makes it the right oracle:
// what we put on the clipboard must decode back through clipboardFilePaths.
// main is bundled to a single file, so the app cannot import a module by path.
// Read the raw flavours out and decode them here — still the real OS clipboard,
// still the write side under test.
const readBackPaths = async (app) => {
  // Windows carries the file as the shell's own FileDropList, which the mac/Linux
  // flavours below cannot see — read it the way Explorer would.
  if (process.platform === 'win32') return shellDropList()
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

// The Windows clipboard is system-wide and OUTLIVES the run, so a prior run's
// entry (same deterministic filename, a temp dir since deleted) can satisfy a
// name poll before this copy lands. Empty it first so only a fresh copy matches.
const clearClipboard = (app) => app.evaluate(({ clipboard }) => clipboard.clear())

// Wait for THIS test's copied file, matched by name. The copy is async (a
// PowerShell hand-off on Windows), and the Windows clipboard is system-wide, so a
// bare "non-empty" poll can latch a prior test's stale, already-swept path.
const waitForCopiedPath = async (app, re) => {
  let match
  await expect
    .poll(
      async () => {
        match = (await readBackPaths(app)).find((p) => re.test(p))
        return match ? 1 : 0
      },
      { timeout: 10_000 }
    )
    .toBe(1)
  return match
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
  await clearClipboard(app)
  await view.getByRole('button', { name: 'Copy as file' }).click()

  const path = await waitForCopiedPath(app, /E2E-copy-target\.\w+$/)
  // The bytes are the snippet's, so what pastes is the snippet and not its name.
  expect(readFileSync(path, 'utf-8')).toContain('alpha')
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
    await page.getByRole('button', { name: 'Paste mode' }).click()
  }
  await left.fill('one\ntwo\n')
  await page.getByPlaceholder('Paste changed text here').fill('one\nTWO\n')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()

  // Through the menu, which is what a reader actually reaches for and what
  // menu-actions.spec.mjs already proves is wired.
  await clearClipboard(app)
  await openMenu(page, 'Edit', 'Copy Diff as File')

  const path = await waitForCopiedPath(app, /\.patch$/)
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
  await clearClipboard(app)
  await view.getByRole('button', { name: 'Copy as file' }).click()
  const staged = await waitForCopiedPath(app, /E2E-ephemeral\.\w+$/)
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
    await clearClipboard(app)
    await view.getByRole('button', { name: 'Copy as file' }).click()
    staged = await waitForCopiedPath(app, /E2E-crash-victim\.\w+$/)
    expect(readFileSync(staged, 'utf-8')).toBe('plaintext')
  } finally {
    // SIGKILL, because this IS the crash the launch sweep is for and no exit
    // handler may run. `app.close()` quits GRACEFULLY, which fires will-quit and
    // starts its sweep — that sweep then races process exit for the file below,
    // a coin toss this test won locally and lost on CI.
    const main = app.process()
    main.kill('SIGKILL')
    await new Promise((resolve) => main.once('exit', resolve))
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

// One useCopyFeedback drove BOTH buttons, so pressing Copy as file flipped the
// shared boolean and the acknowledgement appeared on COPY — the button beside
// the one the reader had actually pressed. `flash(mark)` exists for exactly this
// (a panel with several copy buttons records WHICH one), and neither caller used
// it. Asserted on the rendered labels, since that is the whole of the bug.
test('Copy as file acknowledges itself, not the button beside it', async ({ page }) => {
  test.skip(!(await supported(page)), 'this platform cannot carry a file on the clipboard')

  const view = await addSnippet(page, { name: 'E2E flash target', body: 'alpha' })
  // Names are stable across the flash: only the visible word swaps, so a screen
  // reader is never told the button it is on has become a different button.
  const copy = view.getByRole('button', { name: 'Copy', exact: true })
  const asFile = view.getByRole('button', { name: 'Copy as file' })

  await asFile.click()
  await expect(asFile).toHaveText(/Copied/)
  await expect(copy).toHaveText('Copy') // the untouched twin must not claim it

  // And the same in reverse, so neither is merely hard-coded to its own state.
  await expect(asFile).toHaveText(/Copy as file/) // flash elapsed
  await copy.click()
  await expect(copy).toHaveText('Copied')
  await expect(asFile).toHaveText(/Copy as file/)
})
