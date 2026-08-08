import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { unzipSync } from 'fflate'
import { fileURLToPath } from 'node:url'

// The `diffbro` command is a SECOND launch: Electron's single-instance lock
// hands its argv to the running app, which is the only way this works — nothing
// listens on a port. Only a real second process proves that round trip, so this
// spawns one rather than calling the store.
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')
// The package exports the real binary path — it is nested inside Electron.app
// on macOS, so it cannot be joined by hand.
const ELECTRON = createRequire(import.meta.url)('electron')

// Same, but run FROM a directory — the only way to exercise a relative path,
// which is what a shell actually hands over.
function runCliIn(userDataDir, args, cwd) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return new Promise((resolve) => {
    const p = spawn(ELECTRON, [MAIN, `--user-data-dir=${userDataDir}`, ...args], {
      env,
      cwd,
      stdio: 'ignore'
    })
    p.on('exit', resolve)
    setTimeout(() => resolve(0), 8000)
  })
}

function runCli(userDataDir, args) {
  // DELETE the key — assigning undefined leaves "undefined" in the child env,
  // which Electron reads as truthy and runs itself as plain Node (docs/standards.md).
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return new Promise((resolve) => {
    const p = spawn(ELECTRON, [MAIN, `--user-data-dir=${userDataDir}`, ...args], {
      env,
      stdio: 'ignore'
    })
    p.on('exit', resolve)
    setTimeout(() => resolve(0), 8000)
  })
}

// Same launch, but the output is what matters rather than the app's reaction.
// Same as runCliCapture, but answers the prompts. `new snippet` is the only
// command that reads stdin, and a synchronous reader is exactly the thing a
// unit test cannot exercise.
function runCliAnswering(userDataDir, args, answers) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return new Promise((resolve) => {
    const p = spawn(ELECTRON, [MAIN, `--user-data-dir=${userDataDir}`, ...args], { env })
    let stdout = ''
    let stderr = ''
    p.stdout.on('data', (d) => (stdout += d))
    p.stderr.on('data', (d) => (stderr += d))
    // end(), not write(): reading stdin to EOF is what `cat x | cmd` gives it,
    // and a stream left open makes the read wait forever — correctly.
    p.stdin.end(answers.join('\n') + '\n')
    p.on('exit', (code) => resolve({ code, stdout, stderr }))
  })
}

function runCliCapture(userDataDir, args) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return new Promise((resolve) => {
    const p = spawn(ELECTRON, [MAIN, `--user-data-dir=${userDataDir}`, ...args], { env })
    let stdout = ''
    let stderr = ''
    p.stdout.on('data', (d) => (stdout += d))
    p.stderr.on('data', (d) => (stderr += d))
    p.on('exit', (code) => resolve({ code, stdout, stderr }))
  })
}

test('`diffbro compare` opens the files in the running app', async () => {
  const userDataDir = freshUserDataDir()
  const work = mkdtempSync(join(tmpdir(), 'diffbro-cli-'))
  const left = join(work, 'left.json')
  const right = join(work, 'right.json')
  writeFileSync(left, '{"a":1}')
  writeFileSync(right, '{"a":2}')
  const app = await launchApp(userDataDir)
  try {
    const page = await firstReadyPage(app)
    await expect(page.locator('.slot[data-side="left"]')).toBeVisible()

    await runCli(userDataDir, ['compare', left, right])

    await expect(page.locator('.monaco-diff-editor')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.slot[data-side="left"]')).toContainText('left.json')
    await expect(page.locator('.slot[data-side="right"]')).toContainText('right.json')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(work, { recursive: true, force: true })
  }
})

test('`diffbro clipboard save` stores the clipboard and opens it in the editor', async () => {
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  try {
    const page = await firstReadyPage(app)
    await expect(page.locator('.slot[data-side="left"]')).toBeVisible()
    await page.evaluate(() => window.api.copyText('cli-clipboard-body'))

    await runCli(userDataDir, ['clipboard', 'save'])

    const editor = page.getByRole('dialog', { name: /Snippet/i })
    await expect(editor).toBeVisible({ timeout: 15000 })
    // inputValue(), not [value^=…]: v-model sets the property, never the
    // attribute, so an attribute selector never matches a Vue-bound field.
    await expect
      .poll(() => editor.locator('input').first().inputValue())
      .toMatch(/^Clipboard - \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    await expect(editor).toContainText('cli-clipboard-body')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

// A path typed in a shell is not one the app chose. A folder, a binary and a
// path that isn't there must each be refused visibly, with the app still
// running and no half-loaded comparison left behind.
test('`diffbro compare` refuses a folder, a binary and a missing path', async () => {
  const userDataDir = freshUserDataDir()
  const work = mkdtempSync(join(tmpdir(), 'diffbro-cli-bad-'))
  const folder = join(work, 'a-folder')
  const binary = join(work, 'logo.png')
  const missing = join(work, 'not-here.json')
  mkdirSync(folder)
  writeFileSync(binary, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x00]))

  const app = await launchApp(userDataDir)
  try {
    const page = await firstReadyPage(app)
    await expect(page.locator('.slot[data-side="left"]')).toBeVisible()

    for (const bad of [folder, binary, missing]) {
      await runCli(userDataDir, ['compare', bad])
      // Something is said, and nothing is loaded.
      await expect(page.locator('.notice, .toast, [role="status"]').first()).toBeVisible({
        timeout: 10000
      })
      await expect(page.locator('.monaco-diff-editor')).toHaveCount(0)
      await page.waitForTimeout(400)
    }

    // Still alive and usable afterwards: a good pair still opens.
    const good = join(work, 'ok.json')
    writeFileSync(good, '{"ok":1}')
    await runCli(userDataDir, ['compare', good, good])
    await expect(page.locator('.slot[data-side="left"]')).toContainText('ok.json')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(work, { recursive: true, force: true })
  }
})

test('`diffbro help` prints without opening a window', async () => {
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  try {
    const page = await firstReadyPage(app)
    const before = app.windows().length
    const out = await runCliCapture(userDataDir, ['help'])
    expect(out.stdout).toContain('diffbro compare')
    expect(out.code).toBe(0)

    const detail = await runCliCapture(userDataDir, ['help', 'clipboard'])
    expect(detail.stdout).toContain('after the date and time it was saved')

    const bad = await runCliCapture(userDataDir, ['frobnicate'])
    expect(bad.code).toBe(1)
    expect(bad.stderr).toContain('Unknown command')

    // Help never raises the app or spends a window on itself.
    expect(app.windows().length).toBe(before)
    await expect(page.locator('.monaco-diff-editor')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

// `open` with no file has nothing to send the renderer — the raised window is
// the whole answer, so this proves it does NOT leave a half-loaded comparison
// or a pending command behind.
test('`diffbro open` raises the app without touching the comparison', async () => {
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  try {
    const page = await firstReadyPage(app)
    await expect(page.locator('.slot[data-side="left"]')).toBeVisible()

    await runCli(userDataDir, ['open'])

    await expect(page.locator('.slot[data-side="left"]')).toBeVisible()
    await expect(page.locator('.monaco-diff-editor')).toHaveCount(0)
    await expect(page.locator('.slot[data-side="left"]')).toContainText('left file…')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('`diffbro open <file>` fills the left side and waits for the right', async () => {
  const userDataDir = freshUserDataDir()
  const work = mkdtempSync(join(tmpdir(), 'diffbro-cli-'))
  const only = join(work, 'only.json')
  writeFileSync(only, '{"a":1}')
  const app = await launchApp(userDataDir)
  try {
    const page = await firstReadyPage(app)
    await expect(page.locator('.slot[data-side="left"]')).toBeVisible()

    await runCli(userDataDir, ['open', only])

    await expect(page.locator('.slot[data-side="left"]')).toContainText('only.json', {
      timeout: 15000
    })
    await expect(page.locator('.monaco-diff-editor')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(work, { recursive: true, force: true })
  }
})

// The whole round trip only exists in a launched app: a second process forwards
// the path, the running window asks for the passphrase (the bundle is assembled
// in the renderer, so the terminal cannot), main seals it and writes the zip.
test('`diffbro backup <path>` seals to the path the terminal named', async () => {
  const userDataDir = freshUserDataDir()
  const work = mkdtempSync(join(tmpdir(), 'diffbro-cli-'))
  const target = join(work, 'state.zip')
  const app = await launchApp(userDataDir)
  try {
    const page = await firstReadyPage(app)
    await expect(page.locator('.slot[data-side="left"]')).toBeVisible()

    await runCli(userDataDir, ['backup', target])

    const dialog = page.getByRole('dialog', { name: 'Back up configuration' })
    await expect(dialog).toBeVisible({ timeout: 15000 })
    // Nobody should type a passphrase for a path they cannot see.
    await expect(dialog.locator('.dest')).toContainText(target)

    await dialog.locator('input[type="password"]').fill('a-long-enough-passphrase')
    await dialog
      .getByRole('button', { name: /Back up|Save|Confirm/ })
      .first()
      .click()
    await expect(dialog).toHaveCount(0, { timeout: 15000 })

    await expect.poll(() => existsSync(target), { timeout: 15000 }).toBe(true)
    const files = unzipSync(new Uint8Array(readFileSync(target)))
    expect(Object.keys(files)).toEqual(['diffbro-backup.diffbroconf'])
    // A sealed envelope, not the plaintext bundle.
    const blob = Buffer.from(files['diffbro-backup.diffbroconf']).toString('utf8')
    expect(JSON.parse(Buffer.from(blob, 'base64').toString('utf8')).format).toBe('diffbro-config/1')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(work, { recursive: true, force: true })
  }
})

// A pipe is NOT a TTY, so this drives the PIPED path — which is the only one a
// spawned process can reach. The interactive conversation is unit-tested with
// its IO handed in (tests/main/cliPrompt); what only a real launch proves is
// that the draft crosses to the running app through the single-instance lock
// rather than through argv, and comes out as a snippet.
test('`diffbro create snippet -i` saves a piped body under the flags it was given', async () => {
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  try {
    const page = await firstReadyPage(app)
    const before = await page.locator('.snippets-section .row').count()

    const out = await runCliAnswering(
      userDataDir,
      ['create', 'snippet', '-i', '--name', 'Written from the shell', '--syntax', 'sql'],
      ['select 1;', 'select 2;']
    )
    // The prompts live on stderr; stdout carries the confirmation alone, so a
    // redirect captures the answer and never the questions.
    expect(out.stdout).toContain('Handed to Diff Bro')
    expect(out.stdout).toContain('Written from the shell')
    expect(out.stdout).toContain('2 lines')
    expect(out.stdout).not.toContain('Name')

    const row = page.locator('.snippets-section .row', { hasText: 'Written from the shell' })
    await expect(row).toBeVisible({ timeout: 15000 })
    expect(await page.locator('.snippets-section .row').count()).toBe(before + 1)

    await row.click()
    const view = page.getByRole('dialog', { name: 'Snippet', exact: true })
    await expect(view).toContainText('select 1;')
    await expect(view).toContainText('select 2;')
    await expect(view).toContainText('cli')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

// Piped in, nobody saw a prompt — so every byte is the body, not an answer.
// Reading it as answers is how `cat f.sql | diffbro new snippet` used to save
// the wrong thing under the wrong name.
test('`diffbro create snippet -i` takes a piped body and flags without asking', async () => {
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  try {
    const page = await firstReadyPage(app)
    const out = await runCliAnswering(
      userDataDir,
      ['create', 'snippet', '-i', '--name', 'Piped schema', '--syntax', 'sql', '--tag', 'db'],
      ['create table t (id int);', 'select 1;']
    )
    // No questions were asked, so nothing was written to stderr to ask them.
    expect(out.stderr).not.toContain('Name')
    expect(out.stdout).toContain('Piped schema')
    expect(out.stdout).toContain('tagged cli db')

    const row = page.locator('.snippets-section .row', { hasText: 'Piped schema' })
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.click()
    const view = page.getByRole('dialog', { name: 'Snippet', exact: true })
    await expect(view).toContainText('create table t (id int);')
    await expect(view).toContainText('select 1;')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

// A relative path is resolved against the SHELL's cwd, never the running app's.
// Every e2e passed absolute paths, so nothing noticed when the resolution was
// skipped and `cd ~/work && diffbro compare a.json b.json` read `/a.json`.
test('`diffbro compare` resolves relative paths against the shell, not the app', async () => {
  const userDataDir = freshUserDataDir()
  const work = mkdtempSync(join(tmpdir(), 'diffbro-rel-'))
  writeFileSync(join(work, 'left.json'), '{"a":1}')
  writeFileSync(join(work, 'right.json'), '{"a":2}')
  const app = await launchApp(userDataDir)
  try {
    const page = await firstReadyPage(app)
    // Bare filenames, run from `work` — the app's own cwd is somewhere else.
    await runCliIn(userDataDir, ['compare', 'left.json', 'right.json'], work)
    await expect(page.locator('.slot[data-side="left"]')).toContainText('left.json', {
      timeout: 15000
    })
    await expect(page.locator('.slot[data-side="right"]')).toContainText('right.json')
    await expect(page.locator('.monaco-diff-editor')).toBeVisible({ timeout: 15000 })
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(work, { recursive: true, force: true })
  }
})
