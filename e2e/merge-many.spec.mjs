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

// Thirty conflicted files is an ordinary rebase, not an edge case. git calls the
// tool once per file and waits for each, so the app sees thirty launches in a
// row — and the tab cap is sixteen.
const FILES = 30

function bigConflict() {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-many-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@e',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@e'
  }
  const git = (...args) => execFileSync('git', args, { cwd: dir, env })
  const names = Array.from({ length: FILES }, (_, i) => `file-${String(i).padStart(2, '0')}.txt`)
  git('init', '-q', '-b', 'main')
  for (const name of names) writeFileSync(join(dir, name), `one\nbase\nthree\n`)
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feature')
  for (const name of names) writeFileSync(join(dir, name), `one\ntheirs ${name}\nthree\n`)
  git('commit', '-qam', 'theirs')
  git('checkout', '-q', 'main')
  for (const name of names) writeFileSync(join(dir, name), `one\nours ${name}\nthree\n`)
  git('commit', '-qam', 'ours')
  try {
    git('merge', 'feature')
  } catch {
    // Expected: thirty conflicts.
  }
  return { dir, names, git }
}

function mergetool(userDataDir, dir, file) {
  const env = { ...workerEnv(userDataDir) }
  delete env.ELECTRON_RUN_AS_NODE
  return new Promise((resolve) => {
    const p = spawn(
      ELECTRON,
      [MAIN, `--user-data-dir=${userDataDir}`, 'mergetool', file, file, file],
      { cwd: dir, env, stdio: 'ignore' }
    )
    p.on('exit', resolve)
    setTimeout(resolve, 8000)
  })
}

test('walks thirty conflicted files without running out of room', async () => {
  const { dir, names, git } = bigConflict()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    // Whatever the strip holds before the walk is the baseline; the walk must
    // not add to it.
    const tabsBefore = await page.locator('.tab').count()
    for (const [i, name] of names.entries()) {
      await mergetool(userDataDir, dir, join(dir, name))
      const view = page.locator('.merge-view')
      await expect(view, `file ${i} (${name}) never opened`).toBeVisible({ timeout: 20000 })
      await expect(page.locator('.merge-file')).toHaveText(name)
      // git walks one launch at a time, so the band has to say where you are.
      await expect(page.getByTestId('merge-walk')).toHaveText(`${i + 1} of ${FILES}`)

      // Alternate, so the walk proves both directions and every file gets the
      // answer it was given rather than a lucky default.
      await page.getByTestId(i % 2 ? 'merge-take-theirs' : 'merge-take-ours').click()
      await page.getByTestId('merge-save').click()
      await expect(view).toHaveCount(0, { timeout: 10000 })
    }

    // Every file resolved, with the side it was told, and nothing left unmerged.
    for (const [i, name] of names.entries()) {
      const want = i % 2 ? `theirs ${name}` : `ours ${name}`
      expect(readFileSync(join(dir, name), 'utf8'), name).toBe(`one\n${want}\nthree\n`)
    }
    // The index is NOT checked here: this drives `diffbro mergetool` directly,
    // and it is `git mergetool` that stages a file once the tool exits 0. That
    // half is covered by the host run recorded in the spec; what this proves is
    // that the app survives thirty launches back to back.
    void git

    // The merge is self-contained, so the walk must not have filled the
    // comparison strip — the cap is sixteen and the tool would have jammed.
    expect(await page.locator('.tab').count(), 'the walk opened tabs').toBe(tabsBefore)
    expect(await page.locator('.notice').count(), 'a notice appeared').toBe(0)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})
