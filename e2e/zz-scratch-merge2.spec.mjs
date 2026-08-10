// THROWAWAY audit spec — delete after the sweep.
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

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'T',
  GIT_AUTHOR_EMAIL: 't@e',
  GIT_COMMITTER_NAME: 'T',
  GIT_COMMITTER_EMAIL: 't@e'
}

function repoWith({ base, ours, theirs, name = 'app.txt' }) {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-audit2-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: ENV })
  const file = join(dir, name)
  git('init', '-q', '-b', 'main')
  git('config', 'core.autocrlf', 'false')
  writeFileSync(join(dir, '.gitattributes'), '* -text\n')
  writeFileSync(file, base)
  git('add', '.')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feature')
  writeFileSync(file, theirs)
  git('commit', '-qam', 'theirs')
  git('checkout', '-q', 'main')
  writeFileSync(file, ours)
  git('commit', '-qam', 'ours')
  try {
    git('merge', 'feature')
  } catch {
    /* the conflict under test */
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

async function openMerge(dir, file) {
  const userDataDir = freshUserDataDir()
  const app = await launchApp(userDataDir)
  const page = await firstReadyPage(app)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await runMergetool(userDataDir, dir, file)
  await expect(page.locator('.merge-view')).toBeVisible({ timeout: 20000 })
  return { app, page, errors }
}

const resultLines = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.merge-pane.result .view-line')].map((n) => n.textContent)
  )

// ---- A. the marker-shaped-text file, taken all the way through Save --------
test('AUDIT2 marker-shaped ordinary text, resolved and saved', async () => {
  const doc = (mid) =>
    [
      '# how a conflict looks',
      '',
      '<<<<<<< HEAD',
      'the left side',
      '=======',
      'the right side',
      '>>>>>>> other',
      '',
      `setting = ${mid}`,
      'trailer',
      ''
    ].join('\n')
  const { dir, file } = repoWith({ base: doc('base'), ours: doc('ours'), theirs: doc('theirs') })
  const gitWrote = readFileSync(file, 'utf8')
  console.log('DOC2 git wrote:\n' + gitWrote)
  const { app, page, errors } = await openMerge(dir, file)
  try {
    console.log('DOC2 count:', await page.locator('.merge-count').textContent())
    console.log('DOC2 result at open:', await resultLines(page))
    // Answer BOTH regions the way a user would and save.
    await page.getByTestId('merge-take-ours').click()
    await page.getByTestId('merge-next').click()
    await page.getByTestId('merge-take-ours').click()
    await expect(page.getByTestId('merge-save')).toBeEnabled()
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
    const out = readFileSync(file, 'utf8')
    console.log('DOC2 WROTE:\n' + out)
    console.log('DOC2 errors:', errors)
    // Only `setting =` genuinely conflicted; the documented block is ordinary text.
    console.log('DOC2 kept the documented block:', out.includes('<<<<<<< HEAD'))
    console.log('DOC2 kept "the right side":', out.includes('the right side'))
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---- B. type INSIDE the conflict, then delete it back ---------------------
test('AUDIT2 type inside the conflicted line then delete it back', async () => {
  const { dir, file } = repoWith({
    base: 'one\nbase\nthree\n',
    ours: 'one\nours\nthree\n',
    theirs: 'one\ntheirs\nthree\n'
  })
  const { app, page, errors } = await openMerge(dir, file)
  try {
    const result = page.locator('.merge-pane.result .merge-editor')
    await result.click()
    await page.locator('.merge-pane.result textarea').waitFor()
    // Line 2 is the conflicted one ("ours"). Go to the top, down one, to its end.
    await page.keyboard.press('ControlOrMeta+Home')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('End')
    console.log('TB2 save enabled before typing:', await page.getByTestId('merge-save').isEnabled())
    await page.keyboard.type('X')
    await page.waitForTimeout(250)
    console.log('TB2 after typing:', await resultLines(page))
    console.log('TB2 count after typing:', await page.locator('.merge-count').textContent())
    console.log('TB2 save enabled after typing:', await page.getByTestId('merge-save').isEnabled())
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(250)
    console.log('TB2 after backspace:', await resultLines(page))
    console.log('TB2 count after backspace:', await page.locator('.merge-count').textContent())
    const enabled = await page.getByTestId('merge-save').isEnabled()
    console.log('TB2 save enabled after backspace:', enabled)
    if (enabled) {
      await page.getByTestId('merge-save').click()
      await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
      console.log('TB2 WROTE:', JSON.stringify(readFileSync(file, 'utf8')))
    }
    console.log('TB2 errors:', errors)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---- C. side-pane decorations on an LF file vs a CRLF file ---------------
const counts = (page) =>
  page.evaluate(() => ({
    chevronOurs: document.querySelectorAll('.merge-take-ours').length,
    chevronTheirs: document.querySelectorAll('.merge-take-theirs').length,
    bandOurs: document.querySelectorAll('.merge-side-ours').length,
    bandTheirs: document.querySelectorAll('.merge-side-theirs').length,
    wordOurs: document.querySelectorAll('.merge-word-ours').length,
    wordTheirs: document.querySelectorAll('.merge-word-theirs').length,
    regionMid: document.querySelectorAll('.merge-region').length
  }))

test('AUDIT2 side-pane decorations: LF baseline', async () => {
  const { dir, file } = repoWith({
    base: 'one\nvalue = 1\nthree\n',
    ours: 'one\nvalue = 2\nthree\n',
    theirs: 'one\nvalue = 3\nthree\n'
  })
  const { app, page, errors } = await openMerge(dir, file)
  try {
    await page.waitForTimeout(500)
    console.log('LF decorations:', JSON.stringify(await counts(page)))
    console.log('LF errors:', errors)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

test('AUDIT2 side-pane decorations: CRLF', async () => {
  const { dir, file } = repoWith({
    base: 'one\r\nvalue = 1\r\nthree\r\n',
    ours: 'one\r\nvalue = 2\r\nthree\r\n',
    theirs: 'one\r\nvalue = 3\r\nthree\r\n'
  })
  const { app, page, errors } = await openMerge(dir, file)
  try {
    await page.waitForTimeout(500)
    console.log('CRLF decorations:', JSON.stringify(await counts(page)))
    console.log('CRLF errors:', errors)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})
