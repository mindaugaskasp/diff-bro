import { test, expect, launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'
import { workerEnv } from './workerEnv.mjs'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAIN = join(ROOT, 'build', 'main', 'index.js')
const ELECTRON = createRequire(import.meta.url)('electron')

// Three conflicted files in one merge — the state `git mergetool` walks and the
// only thing that proves the list is real. jsdom cannot see any of it: the
// enumeration is a git call in main, and the walk spans separate launches.
const NAMES = ['alpha.txt', 'beta.txt', 'gamma.txt']

function conflictedRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-walk-'))
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'T',
    GIT_AUTHOR_EMAIL: 't@e',
    GIT_COMMITTER_NAME: 'T',
    GIT_COMMITTER_EMAIL: 't@e'
  }
  const git = (...args) => execFileSync('git', args, { cwd: dir, env })
  const write = (name, body) => writeFileSync(join(dir, name), body)
  git('init', '-q', '-b', 'main')
  for (const name of NAMES) write(name, 'one\nbase\nthree\n')
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feature')
  for (const name of NAMES) write(name, 'one\ntheirs\nthree\n')
  git('commit', '-qam', 'theirs')
  git('checkout', '-q', 'main')
  for (const name of NAMES) write(name, 'one\nours\nthree\n')
  git('commit', '-qam', 'ours')
  try {
    git('merge', 'feature')
  } catch {
    // Expected: this is the conflict under test.
  }
  return { dir, path: (name) => join(dir, name) }
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

// The launcher polls for this beside $MERGED and exits on it; `written` is what
// tells git the file was resolved.
const sentinel = (file) => `${file}.diffbro-merge-done`

test('opens the list of every conflicted file before the merge', async () => {
  const repo = conflictedRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, repo.dir, repo.path('alpha.txt'))

    const dialog = page.getByTestId('conflicts-dialog')
    await expect(dialog).toBeVisible({ timeout: 20000 })
    for (const name of NAMES) {
      await expect(page.getByTestId(`conflict-row-${name}`)).toBeVisible()
    }
    // The three-way view is behind it, on the file git actually asked about.
    await expect(page.locator('.merge-view')).toBeVisible()
  } finally {
    await app.close().catch(() => {})
    rmSync(repo.dir, { recursive: true, force: true })
  }
})

// The whole point of the list: git asked about alpha, and the reader answers
// gamma. Main computes that path from the repo root plus the row's index — the
// renderer never names a file.
test('answers a file out of git’s order, from its row', async () => {
  const repo = conflictedRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, repo.dir, repo.path('alpha.txt'))
    await expect(page.getByTestId('conflicts-dialog')).toBeVisible({ timeout: 20000 })

    // The row's answers are quiet until the row is pointed at, the way they are
    // for a reader.
    await page.getByTestId('conflict-row-gamma.txt').hover()
    await page.getByTestId('conflict-theirs-gamma.txt').click()

    // Written from the index, with no editor opened for it.
    await expect
      .poll(() => readFileSync(repo.path('gamma.txt'), 'utf8'), { timeout: 10000 })
      .toBe('one\ntheirs\nthree\n')
    // alpha is the file git asked about and is untouched.
    expect(readFileSync(repo.path('alpha.txt'), 'utf8')).toContain('<<<<<<<')

    const row = page.getByTestId('conflict-row-gamma.txt')
    await expect(row).toHaveClass(/done/)
  } finally {
    await app.close().catch(() => {})
    rmSync(repo.dir, { recursive: true, force: true })
  }
})

// A file answered out of order still gets a launch of its own later. Left to the
// marker guard it would be refused with NO sentinel written, and the terminal
// running `git mergetool` would wait out the launcher's two hours.
test('a relaunch for an already-answered file releases git without a window', async () => {
  const repo = conflictedRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, repo.dir, repo.path('alpha.txt'))
    await expect(page.getByTestId('conflicts-dialog')).toBeVisible({ timeout: 20000 })
    await page.getByTestId('conflict-row-gamma.txt').hover()
    await page.getByTestId('conflict-theirs-gamma.txt').click()
    await expect(page.getByTestId('conflict-row-gamma.txt')).toHaveClass(/done/, { timeout: 10000 })

    const gamma = repo.path('gamma.txt')
    rmSync(sentinel(gamma), { force: true })
    await runMergetool(userDataDir, repo.dir, gamma)

    await expect.poll(() => existsSync(sentinel(gamma)), { timeout: 10000 }).toBe(true)
    expect(readFileSync(sentinel(gamma), 'utf8')).toBe('written')
    // Still showing alpha: the relaunch never became a view of its own.
    await expect(page.getByTestId('merge-walk')).toContainText('1 of 3')
  } finally {
    await app.close().catch(() => {})
    rmSync(repo.dir, { recursive: true, force: true })
  }
})

// The defect the design review found: dismissing the list used to be the end of
// it. Closing it must leave the walk alive and offer a way back.
test('closing the list keeps the merge alive, and the walk chip reopens it', async () => {
  const repo = conflictedRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, repo.dir, repo.path('alpha.txt'))
    const dialog = page.getByTestId('conflicts-dialog')
    await expect(dialog).toBeVisible({ timeout: 20000 })

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    // The merge is still under way — Escape closed a list, not a session.
    await expect(page.locator('.merge-view')).toBeVisible()

    await page.getByTestId('merge-walk').click()
    await expect(dialog).toBeVisible()

    await page.getByTestId('conflicts-close').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('toolbar-conflicts')).toBeVisible()
    await page.getByTestId('toolbar-conflicts').click()
    await expect(dialog).toBeVisible()
  } finally {
    await app.close().catch(() => {})
    rmSync(repo.dir, { recursive: true, force: true })
  }
})

// Opening a row that is not the launch's own file and saving it: the write goes
// to that row, verified against git's unmerged list on the way in.
test('opens another row in the three-way view and saves that file', async () => {
  const repo = conflictedRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, repo.dir, repo.path('alpha.txt'))
    await expect(page.getByTestId('conflicts-dialog')).toBeVisible({ timeout: 20000 })

    await page.getByTestId('conflict-row-beta.txt').click()
    await expect(page.getByTestId('conflicts-dialog')).toHaveCount(0)
    await expect(page.locator('.merge-view')).toBeVisible()
    await expect(page.locator('.merge-file')).toHaveText('beta.txt')

    await page.getByTestId('merge-take-ours').click()
    const save = page.getByTestId('merge-save')
    await expect(save).toBeEnabled()
    await save.click()

    await expect
      .poll(() => readFileSync(repo.path('beta.txt'), 'utf8'), { timeout: 10000 })
      .toBe('one\nours\nthree\n')
    // Saving returns the reader to the list, where the remaining work is.
    await expect(page.getByTestId('conflicts-dialog')).toBeVisible({ timeout: 10000 })
  } finally {
    await app.close().catch(() => {})
    rmSync(repo.dir, { recursive: true, force: true })
  }
})

// The take control moved out of Monaco's glyph margin onto the pane's inner
// edge, because a glyph margin only exists on an editor's LEFT edge and is not
// reachable from the keyboard. Only a real editor places these.
test('the take buttons sit on the panes’ inner edges, against the result', async () => {
  const repo = conflictedRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, repo.dir, repo.path('alpha.txt'))
    await expect(page.getByTestId('conflicts-dialog')).toBeVisible({ timeout: 20000 })
    await page.keyboard.press('Escape')

    const ours = page.getByTestId('merge-take-ours-0')
    const theirs = page.getByTestId('merge-take-theirs-0')
    await expect(ours).toBeVisible()
    await expect(theirs).toBeVisible()

    const panes = page.locator('.merge-pane')
    const [oursPane, resultPane, theirsPane] = await Promise.all(
      [0, 1, 2].map((i) => panes.nth(i).boundingBox())
    )
    const oursBox = await ours.boundingBox()
    const theirsBox = await theirs.boundingBox()

    // Ours straddles the divider between the left pane and the result…
    expect(Math.abs(oursBox.x + oursBox.width / 2 - oursPane.x - oursPane.width)).toBeLessThan(4)
    // …and theirs the one between the result and the right pane.
    expect(Math.abs(theirsBox.x + theirsBox.width / 2 - theirsPane.x)).toBeLessThan(4)
    // Neither is out at the window's edge, which is where the glyph margin put
    // the ours chevron.
    expect(oursBox.x).toBeGreaterThan(resultPane.x - 40)

    // A real button, so it answers a keyboard too.
    await theirs.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('merge-save')).toBeEnabled()
  } finally {
    await app.close().catch(() => {})
    rmSync(repo.dir, { recursive: true, force: true })
  }
})

// The most likely path through the new dialog: the launch's OWN file is
// pre-selected, so the primary Resolve button opens it. Saving used to write the
// file and never release the launcher — the terminal running `git mergetool`
// then waited out its full two hours on a decision already made.
test('resolving the launch’s own file from the list still releases git', async () => {
  const repo = conflictedRepo()
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  const alpha = repo.path('alpha.txt')
  try {
    rmSync(sentinel(alpha), { force: true })
    await runMergetool(userDataDir, repo.dir, alpha)
    await expect(page.getByTestId('conflicts-dialog')).toBeVisible({ timeout: 20000 })

    // The pre-selected row IS alpha, so this is the button a reader reaches for.
    await page.getByTestId('conflicts-resolve').click()
    await expect(page.locator('.merge-file')).toHaveText('alpha.txt')
    await page.getByTestId('merge-take-ours').click()
    await page.getByTestId('merge-save').click()

    await expect.poll(() => existsSync(sentinel(alpha)), { timeout: 10000 }).toBe(true)
    expect(readFileSync(sentinel(alpha), 'utf8')).toBe('written')
    expect(readFileSync(alpha, 'utf8')).toBe('one\nours\nthree\n')
  } finally {
    await app.close().catch(() => {})
    rmSync(repo.dir, { recursive: true, force: true })
  }
})

// A launch for a file in NO repository used to leave the previous repository's
// row armed, so the next Save wrote THAT repo's file with text typed for this
// one — silently destroying a conflict in a directory the reader was not even
// looking at.
test('a launch outside any repository cannot write the previous one’s file', async () => {
  const repo = conflictedRepo()
  const loose = mkdtempSync(join(tmpdir(), 'diffbro-loose-'))
  const loosePath = join(loose, 'loose.txt')
  writeFileSync(
    loosePath,
    'top\n<<<<<<< HEAD\nLOOSE-OURS\n=======\nLOOSE-THEIRS\n>>>>>>> x\nbottom\n'
  )
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  try {
    await runMergetool(userDataDir, repo.dir, repo.path('alpha.txt'))
    await expect(page.getByTestId('conflicts-dialog')).toBeVisible({ timeout: 20000 })
    // Arm a row in the repo, then leave it for a file git does not own.
    await page.getByTestId('conflict-row-beta.txt').click()
    await expect(page.locator('.merge-file')).toHaveText('beta.txt')

    const betaBefore = readFileSync(repo.path('beta.txt'), 'utf8')
    await runMergetool(userDataDir, loose, loosePath)
    await expect(page.locator('.merge-file')).toHaveText('loose.txt', { timeout: 20000 })
    await page.getByTestId('merge-take-theirs').click()
    await page.getByTestId('merge-save').click()

    // The loose file is the one that changes; beta is untouched.
    await expect
      .poll(() => readFileSync(loosePath, 'utf8'), { timeout: 10000 })
      .toBe('top\nLOOSE-THEIRS\nbottom\n')
    expect(readFileSync(repo.path('beta.txt'), 'utf8')).toBe(betaBefore)
  } finally {
    await app.close().catch(() => {})
    rmSync(repo.dir, { recursive: true, force: true })
    rmSync(loose, { recursive: true, force: true })
  }
})
