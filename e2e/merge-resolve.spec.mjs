import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'
import { workerEnv } from './workerEnv.mjs'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')
const ELECTRON = createRequire(import.meta.url)('electron')

// A conflict git actually produced, resolved through the app, and the file git
// is left holding. Only a real launch proves the whole chain: main reads
// $MERGED, the renderer resolves, and main writes the path it has held since.
function conflictedRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-merge-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@e',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@e'
  }
  const git = (...args) => execFileSync('git', args, { cwd: dir, env })
  const file = join(dir, 'app.txt')
  git('init', '-q', '-b', 'main')
  writeFileSync(file, 'one\nbase\nthree\n')
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feature')
  writeFileSync(file, 'one\ntheirs\nthree\n')
  git('commit', '-qam', 'theirs')
  git('checkout', '-q', 'main')
  writeFileSync(file, 'one\nours\nthree\n')
  git('commit', '-qam', 'ours')
  try {
    git('merge', 'feature')
  } catch {
    // Expected: this is the conflict under test.
  }
  return { dir, file }
}

function runMergetool(userDataDir, dir, file) {
  const env = { ...workerEnv(userDataDir) }
  delete env.ELECTRON_RUN_AS_NODE
  return new Promise((resolve) => {
    const p = spawn(
      ELECTRON,
      [MAIN, `--user-data-dir=${userDataDir}`, 'mergetool', file, file, file],
      { cwd: dir, env, stdio: 'ignore' }
    )
    p.on('exit', () => resolve())
    setTimeout(resolve, 8000)
  })
}

test('resolves a real conflict and writes the merged file back', async () => {
  const { dir, file } = conflictedRepo()
  expect(readFileSync(file, 'utf8')).toContain('<<<<<<<')

  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)

    const view = page.locator('.merge-view')
    await expect(view).toBeVisible({ timeout: 20000 })
    // Three panes: the two commits either side of the file being produced.
    await expect(page.locator('.merge-pane')).toHaveCount(3)

    // Nothing may be written while a region is still undecided.
    const save = page.getByTestId('merge-save')
    await expect(save).toBeDisabled()

    await page.getByTestId('merge-take-theirs').click()
    await expect(save).toBeEnabled()
    await save.click()
    await expect(view).toHaveCount(0, { timeout: 10000 })

    // The file git is left holding: their side, no markers.
    const merged = readFileSync(file, 'utf8')
    expect(merged).toBe('one\ntheirs\nthree\n')
    expect(merged).not.toContain('<<<<<<<')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

test('declining leaves the file exactly as git left it', async () => {
  const { dir, file } = conflictedRepo()
  const before = readFileSync(file)
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('.merge-view')).toHaveCount(0)

    // Untouched, markers and all — the reader said no.
    expect(readFileSync(file).equals(before)).toBe(true)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// git calls the mergetool for a BINARY conflict too, and leaves it with no
// markers. Reading it as text turned every invalid byte into U+FFFD and one
// click wrote that over the file.
test('refuses a binary conflict instead of destroying it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-merge-bin-'))
  const file = join(dir, 'blob.bin')
  const bytes = Buffer.from([0x00, 0x01, 0x02, 0x07, 0xff, 0xfe, 0x00, 0x0a])
  writeFileSync(file, bytes)
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await page.waitForTimeout(1500)
    await expect(page.locator('.merge-view')).toHaveCount(0)
    expect(readFileSync(file).equals(bytes)).toBe(true)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// A file with no markers is not "already resolved" — it is a file this tool has
// no business rewriting.
test('refuses a file with no conflict markers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-merge-plain-'))
  const file = join(dir, 'plain.txt')
  writeFileSync(file, 'nothing to resolve\n')
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await page.waitForTimeout(1500)
    await expect(page.locator('.merge-view')).toHaveCount(0)
    expect(readFileSync(file, 'utf8')).toBe('nothing to resolve\n')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// The whole reason for the rebuild: neither side is always right, and the
// result is a real editor.
test('takes a side, then lets the reader type the answer neither side had', async () => {
  const { dir, file } = conflictedRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })

    // The sides come out of git's index, so they are whole files with no
    // markers in them — not the fragments the old dialog showed.
    const ours = page.locator('.merge-pane').first()
    await expect(ours).toContainText('ours')
    await expect(ours).not.toContainText('<<<<<<<')

    await page.getByTestId('merge-take-ours').click()
    await expect(page.getByTestId('merge-save')).toBeEnabled()

    // Now edit the result by hand, which the resolver could not express.
    const result = page.locator('.merge-pane.result .merge-editor')
    await result.click()
    await page.locator('.merge-pane.result textarea').waitFor()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('one\nhand written\nthree\n')
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })

    expect(readFileSync(file, 'utf8')).toBe('one\nhand written\nthree\n')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// The take buttons are the interaction a merge tool is judged on: the side you
// want, moved into the result from where it sits.
test('a take button moves that side into the result', async () => {
  const { dir, file } = conflictedRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })

    // The result opens as a valid FILE — no markers anywhere in the view.
    const result = page.locator('.merge-pane.result')
    await expect(result).not.toContainText('<<<<<<<')
    await expect(result).not.toContainText('=======')

    const theirButton = page.getByTestId('merge-take-theirs-0')
    await expect(theirButton).toHaveCount(1)
    await theirButton.click()

    await expect(page.getByTestId('merge-save')).toBeEnabled()
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
    expect(readFileSync(file, 'utf8')).toBe('one\ntheirs\nthree\n')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// The sides come out of git's INDEX, not from re-reading the markers. The
// difference shows where git auto-merged a hunk: the reconstruction carries the
// merged line into both sides, the index does not. This was silently falling
// back on macOS, where git reports /private/var for a repo under /var and the
// relative path came out full of `..`.
test('reads both sides from the index, not from the markers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-merge-idx-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@e',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@e'
  }
  const git = (...args) => execFileSync('git', args, { cwd: dir, env })
  const file = join(dir, 'app.txt')
  git('init', '-q', '-b', 'main')
  // `mode` is changed by THEM alone and git merges it without asking; `value`
  // is changed by both and conflicts. The unchanged lines between them matter:
  // git folds ADJACENT changes into one hunk, and then nothing is auto-merged.
  writeFileSync(file, 'value: base\nkeep one\nkeep two\nkeep three\nmode: fast\n')
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feature')
  writeFileSync(file, 'value: theirs\nkeep one\nkeep two\nkeep three\nmode: safe\n')
  git('commit', '-qam', 'theirs')
  git('checkout', '-q', 'main')
  writeFileSync(file, 'value: ours\nkeep one\nkeep two\nkeep three\nmode: fast\n')
  git('commit', '-qam', 'ours')
  try {
    git('merge', 'feature')
  } catch {
    // Expected.
  }

  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })

    // Our side still says `fast`; only the auto-merged RESULT says `safe`.
    await expect(page.locator('.merge-pane').first()).toContainText('mode: fast')
    await expect(page.locator('.merge-pane').last()).toContainText('mode: safe')
    await expect(page.locator('.merge-pane.result')).toContainText('mode: safe')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// The answer neither side had, typed straight in — with no button pressed after
// it. A resolver that still demands a click has not accepted the edit.
test('typing in a conflict is itself the answer to it', async () => {
  const { dir, file } = conflictedRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })

    const save = page.getByTestId('merge-save')
    await expect(save).toBeDisabled()

    const result = page.locator('.merge-pane.result .merge-editor')
    await result.click()
    await page.locator('.merge-pane.result textarea').waitFor()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('one\nboth of us were wrong\nthree\n')

    await expect(save).toBeEnabled()
    await save.click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
    expect(readFileSync(file, 'utf8')).toBe('one\nboth of us were wrong\nthree\n')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// Which branch a side IS, read out of git rather than guessed. The panes said
// only "Ours" and "Theirs", which names neither commit.
test('names the branches the two sides come from', async () => {
  const { dir, file } = conflictedRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('.merge-pane').first()).toContainText('main')
    await expect(page.locator('.merge-pane').last()).toContainText('feature')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// The grips are grid children too. Left to take column tracks of their own they
// wrapped Theirs onto a second row and cut the result pane to half the height.
test('the three panes fill one full-height row', async () => {
  const { dir, file } = conflictedRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })

    const row = await page.locator('.merge-panes').boundingBox()
    const panes = await page.locator('.merge-pane').all()
    let spanned = 0
    for (const pane of panes) {
      const box = await pane.boundingBox()
      expect(Math.abs(box.y - row.y)).toBeLessThan(2)
      expect(Math.abs(box.height - row.height)).toBeLessThan(2)
      spanned += box.width
    }
    // Side by side across the whole row, with no track spent on a grip.
    expect(Math.abs(spanned - row.width)).toBeLessThan(4)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// Three fixed thirds is not enough to read a wide file in; the dividers move.
test('the panes can be widened, and the split is remembered', async () => {
  const { dir, file } = conflictedRepo()
  const userDataDir = freshUserDataDir()
  let app = await launchApp(userDataDir)
  let page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })

    const ours = page.locator('.merge-pane').first()
    const before = (await ours.boundingBox()).width
    const grip = page.locator('.merge-grip').first()
    const box = await grip.boundingBox()
    await page.mouse.move(box.x, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 220, box.y + box.height / 2, { steps: 8 })
    await page.mouse.up()

    const after = (await ours.boundingBox()).width
    expect(after).toBeGreaterThan(before + 100)

    // A drag is a decision, so it outlives the window it was made in.
    await app.close()
    app = await launchApp(userDataDir)
    page = await firstReadyPage(app)
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })
    const restored = (await page.locator('.merge-pane').first().boundingBox()).width
    expect(Math.abs(restored - after)).toBeLessThan(24)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// A conflict where OUR side DELETED the lines is an insertion point, not a
// one-line region — and Monaco cannot tell the two ranges apart. Read as a line,
// taking theirs wrote over the first stable line after the conflict and that
// line was gone from the file git was handed.
function deletedSideRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-merge-del-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@e',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@e'
  }
  const git = (...args) => execFileSync('git', args, { cwd: dir, env })
  const file = join(dir, 'app.txt')
  git('init', '-q', '-b', 'main')
  writeFileSync(file, 'head\nmiddle\ntail\n')
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feature')
  writeFileSync(file, 'head\nthey rewrote it\ntail\n')
  git('commit', '-qam', 'theirs')
  git('checkout', '-q', 'main')
  // We DELETED the line they rewrote: our side of the conflict is empty.
  writeFileSync(file, 'head\ntail\n')
  git('commit', '-qam', 'ours')
  try {
    git('merge', 'feature')
  } catch {
    // Expected.
  }
  return { dir, file }
}

test('takes their side into a region ours emptied without eating the next line', async () => {
  const { dir, file } = deletedSideRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })

    await page.getByTestId('merge-take-theirs').click()
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })

    expect(readFileSync(file, 'utf8')).toBe('head\nthey rewrote it\ntail\n')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// Answered once it is no longer an insertion point, so changing your mind must
// REPLACE what the first answer wrote rather than leave both in the file.
test('lets the reader change their mind about a region ours emptied', async () => {
  const { dir, file } = deletedSideRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })

    await page.getByTestId('merge-take-theirs').click()
    await page.getByTestId('merge-take-ours').click()
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })

    expect(readFileSync(file, 'utf8')).toBe('head\ntail\n')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// Enough unchanged lines between the two changes that git keeps them as SEPARATE
// conflicts: with only three it folds them into one hunk and the test proves
// nothing about ordering.
const KEEP = Array.from({ length: 9 }, (_, i) => `keep ${i + 1}`).join('\n')

// Resolving the SECOND conflict first is the ordinary way a reader works, and it
// is where a stale line number would show: the earlier region must still be
// where it was, and answering it must not disturb the one already settled.
test('resolves two conflicts out of order without disturbing either', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-merge-two-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@e',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@e'
  }
  const git = (...args) => execFileSync('git', args, { cwd: dir, env })
  const file = join(dir, 'app.txt')
  git('init', '-q', '-b', 'main')
  writeFileSync(file, `top\nA base\n${KEEP}\nB base\nbottom\n`)
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feature')
  writeFileSync(file, `top\nA theirs\n${KEEP}\nB theirs\nbottom\n`)
  git('commit', '-qam', 'theirs')
  git('checkout', '-q', 'main')
  writeFileSync(file, `top\nA ours\n${KEEP}\nB ours\nbottom\n`)
  git('commit', '-qam', 'ours')
  try {
    git('merge', 'feature')
  } catch {
    // Expected.
  }

  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })

    // Second conflict first: step to it, take theirs, then come back for the first.
    await page.getByTestId('merge-next').click()
    await page.getByTestId('merge-take-theirs').click()
    await page.getByTestId('merge-prev').click()
    await page.getByTestId('merge-take-ours').click()

    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
    expect(readFileSync(file, 'utf8')).toBe(`top\nA ours\n${KEEP}\nB theirs\nbottom\n`)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// A merge tool that reformats the file it resolves is one nobody trusts twice.
// Both of these are invisible on screen and only the bytes can say.
function endingsRepo(body) {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-merge-eol-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@e',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@e'
  }
  const git = (...args) => execFileSync('git', args, { cwd: dir, env })
  const file = join(dir, 'app.txt')
  git('init', '-q', '-b', 'main')
  // core.autocrlf off, so what is written is what git stores and hands back.
  git('config', 'core.autocrlf', 'false')
  writeFileSync(file, body('base'))
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feature')
  writeFileSync(file, body('theirs'))
  git('commit', '-qam', 'theirs')
  git('checkout', '-q', 'main')
  writeFileSync(file, body('ours'))
  git('commit', '-qam', 'ours')
  try {
    git('merge', 'feature')
  } catch {
    // Expected.
  }
  return { dir, file }
}

test('writes a CRLF file back with CRLF', async () => {
  const { dir, file } = endingsRepo((v) => `one\r\n${v}\r\nthree\r\n`)
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })
    await page.getByTestId('merge-take-theirs').click()
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })

    const merged = readFileSync(file, 'utf8')
    expect(merged).toBe('one\r\ntheirs\r\nthree\r\n')
    expect(merged).not.toMatch(/[^\r]\n/)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

test('leaves a file that ended without a newline ending without one', async () => {
  const { dir, file } = endingsRepo((v) => `one\n${v}\nthree`)
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })
    await page.getByTestId('merge-take-theirs').click()
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })

    expect(readFileSync(file, 'utf8')).toBe('one\ntheirs\nthree')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// The headline promise, on the region that could not keep it: our side deleted
// the lines, so there is no chevron to click and the reader types the answer.
// It stayed unresolved and Save stayed locked with the conflict visibly answered.
test('takes a typed answer in a region ours emptied', async () => {
  const { dir, file } = deletedSideRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })

    const save = page.getByTestId('merge-save')
    await expect(save).toBeDisabled()

    const result = page.locator('.merge-pane.result .merge-editor')
    await result.click()
    await page.locator('.merge-pane.result textarea').waitFor()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('head\nneither of you\ntail\n')

    await expect(save).toBeEnabled()
    await save.click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
    expect(readFileSync(file, 'utf8')).toBe('head\nneither of you\ntail\n')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// Undo puts back the lines "Neither" removed, so the region holds them again.
// Left cached as an insertion point, the next answer was INSERTED above them and
// the file went out holding both sides.
test('answers a region again after undoing a Neither', async () => {
  const { dir, file } = deletedSideRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })

    await page.getByTestId('merge-take-theirs').click()
    const result = page.locator('.merge-pane.result .merge-editor')
    await result.click()
    await page.locator('.merge-pane.result textarea').waitFor()
    await page.keyboard.press('ControlOrMeta+z')
    await page.getByTestId('merge-take-theirs').click()

    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })

    const merged = readFileSync(file, 'utf8')
    expect(merged).toBe('head\nthey rewrote it\ntail\n')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// A document ABOUT merge conflicts carries marker-shaped lines of its own. The
// parser cannot tell them from git's, so the view offered them as a decision and
// answering it dropped half the document — silently, because the result pane
// shows no markers to notice by. git never writes markers into the index, so the
// pristine sides settle which blocks it actually wrote.
test('leaves marker-shaped prose alone and offers only the real conflict', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-merge-prose-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@e',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@e'
  }
  const git = (...args) => execFileSync('git', args, { cwd: dir, env })
  const file = join(dir, 'doc.md')
  // The markers are BUILT here rather than written literally, so this spec is
  // not itself a file full of conflict markers.
  const example = [
    '<'.repeat(7) + ' HEAD',
    'the left side',
    '='.repeat(7),
    'the right side',
    '>'.repeat(7) + ' other'
  ]
  const doc = (setting) =>
    ['# how a conflict looks', '', ...example, '', `setting = ${setting}`, 'trailer', ''].join('\n')

  git('init', '-q', '-b', 'main')
  writeFileSync(file, doc('base'))
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feature')
  writeFileSync(file, doc('theirs'))
  git('commit', '-qam', 'theirs')
  git('checkout', '-q', 'main')
  writeFileSync(file, doc('ours'))
  git('commit', '-qam', 'ours')
  try {
    git('merge', 'feature')
  } catch {
    // Expected.
  }

  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, dir, file)
    await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })

    // One decision, not two: the document's own example is not one.
    await expect(page.locator('.merge-count')).toHaveText('1 conflict left')

    await page.getByTestId('merge-take-theirs').click()
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })

    // The document survives intact, markers and both of its sides.
    expect(readFileSync(file, 'utf8')).toBe(doc('theirs'))
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})
