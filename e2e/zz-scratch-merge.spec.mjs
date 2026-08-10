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
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-audit-'))
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

const hex = (buf) => buf.toString('hex')

// ---------------------------------------------------------------- 1. CRLF
test('AUDIT crlf file round-trips byte for byte', async () => {
  const { dir, file } = repoWith({
    base: 'one\r\nbase\r\nthree\r\n',
    ours: 'one\r\nours\r\nthree\r\n',
    theirs: 'one\r\ntheirs\r\nthree\r\n'
  })
  const raw = readFileSync(file)
  console.log('CRLF conflicted-on-disk:', JSON.stringify(raw.toString('utf8')))
  const { app, page, errors } = await openMerge(dir, file)
  try {
    const chev = await page.locator('.merge-pane').last().locator('.merge-take-theirs').count()
    console.log('CRLF theirs-pane chevrons:', chev)
    const oursChev = await page.locator('.merge-pane').first().locator('.merge-take-ours').count()
    console.log('CRLF ours-pane chevrons:', oursChev)
    await page.getByTestId('merge-take-theirs').click()
    await expect(page.getByTestId('merge-save')).toBeEnabled()
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
    const out = readFileSync(file)
    console.log('CRLF written:', JSON.stringify(out.toString('utf8')), hex(out))
    console.log('CRLF errors:', errors)
    expect(out.toString('utf8')).toBe('one\r\ntheirs\r\nthree\r\n')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// ------------------------------------------------- 2. no trailing newline
test('AUDIT file with no trailing newline keeps not having one', async () => {
  const { dir, file } = repoWith({
    base: 'one\nbase\nthree',
    ours: 'one\nours\nthree',
    theirs: 'one\ntheirs\nthree'
  })
  const raw = readFileSync(file)
  console.log('NOEOL conflicted-on-disk:', JSON.stringify(raw.toString('utf8')))
  const { app, page, errors } = await openMerge(dir, file)
  try {
    await page.getByTestId('merge-take-theirs').click()
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
    const out = readFileSync(file)
    console.log('NOEOL written:', JSON.stringify(out.toString('utf8')), hex(out))
    console.log('NOEOL errors:', errors)
    expect(out.toString('utf8')).toBe('one\ntheirs\nthree')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// ------------------------------------------------ 3. one side deleted it
test('AUDIT conflict where our side deleted the lines', async () => {
  const { dir, file } = repoWith({
    base: 'head\nkeep-a\nkeep-b\nx1\nx2\nkeep-c\nkeep-d\ntail\n',
    ours: 'head\nkeep-a\nkeep-b\nkeep-c\nkeep-d\ntail\n',
    theirs: 'head\nkeep-a\nkeep-b\ny1\ny2\nkeep-c\nkeep-d\ntail\n'
  })
  const raw = readFileSync(file, 'utf8')
  console.log('EMPTY-OURS conflicted-on-disk:\n' + raw)
  const { app, page, errors } = await openMerge(dir, file)
  try {
    console.log('EMPTY-OURS result lines at open:', await resultLines(page))
    console.log(
      'EMPTY-OURS chevrons ours/theirs:',
      await page.locator('.merge-pane').first().locator('.merge-take-ours').count(),
      await page.locator('.merge-pane').last().locator('.merge-take-theirs').count()
    )
    await page.getByTestId('merge-take-theirs').click()
    console.log('EMPTY-OURS result lines after take theirs:', await resultLines(page))
    await expect(page.getByTestId('merge-save')).toBeEnabled()
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
    const out = readFileSync(file, 'utf8')
    console.log('EMPTY-OURS written:', JSON.stringify(out))
    console.log('EMPTY-OURS errors:', errors)
    expect(out).toBe('head\nkeep-a\nkeep-b\ny1\ny2\nkeep-c\nkeep-d\ntail\n')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// ------------------------------------------- 4. two conflicts, out of order
const TWO = {
  base: [
    'a1',
    'a2',
    'a3',
    'FIRST-base',
    'b1',
    'b2',
    'b3',
    'b4',
    'b5',
    'b6',
    'SECOND-base',
    'c1',
    'c2',
    'c3',
    ''
  ].join('\n'),
  ours: [
    'a1',
    'a2',
    'a3',
    'FIRST-ours',
    'b1',
    'b2',
    'b3',
    'b4',
    'b5',
    'b6',
    'SECOND-ours',
    'c1',
    'c2',
    'c3',
    ''
  ].join('\n'),
  theirs: [
    'a1',
    'a2',
    'a3',
    'FIRST-theirs',
    'b1',
    'b2',
    'b3',
    'b4',
    'b5',
    'b6',
    'SECOND-theirs',
    'c1',
    'c2',
    'c3',
    ''
  ].join('\n')
}

test('AUDIT two conflicts resolved second-then-first', async () => {
  const { dir, file } = repoWith(TWO)
  console.log('TWO conflicted-on-disk:\n' + readFileSync(file, 'utf8'))
  const { app, page, errors } = await openMerge(dir, file)
  try {
    console.log('TWO count text:', await page.locator('.merge-count').textContent())
    // Move to the SECOND region and answer it first.
    await page.getByTestId('merge-next').click()
    await page.getByTestId('merge-take-theirs').click()
    console.log('TWO after 2nd:', await page.locator('.merge-count').textContent())
    // Back to the first.
    await page.getByTestId('merge-prev').click()
    await page.getByTestId('merge-take-ours').click()
    console.log('TWO after 1st:', await page.locator('.merge-count').textContent())
    await expect(page.getByTestId('merge-save')).toBeEnabled()
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
    const out = readFileSync(file, 'utf8')
    console.log('TWO written:\n' + out)
    console.log('TWO errors:', errors)
    expect(out).toBe(
      'a1\na2\na3\nFIRST-ours\nb1\nb2\nb3\nb4\nb5\nb6\nSECOND-theirs\nc1\nc2\nc3\n'
    )
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------- 5. undo + save
test('AUDIT take a side then undo, then save', async () => {
  const { dir, file } = repoWith({
    base: 'one\nbase\nthree\n',
    ours: 'one\nours\nthree\n',
    theirs: 'one\ntheirs\nthree\n'
  })
  const { app, page, errors } = await openMerge(dir, file)
  try {
    await page.getByTestId('merge-take-theirs').click()
    console.log('UNDO after take:', await resultLines(page))
    const result = page.locator('.merge-pane.result .merge-editor')
    await result.click()
    await page.locator('.merge-pane.result textarea').waitFor()
    await page.keyboard.press('ControlOrMeta+z')
    await page.waitForTimeout(300)
    console.log('UNDO after ctrl+z:', await resultLines(page))
    console.log('UNDO count text:', await page.locator('.merge-count').textContent())
    console.log('UNDO save enabled:', await page.getByTestId('merge-save').isEnabled())
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
    const out = readFileSync(file, 'utf8')
    console.log('UNDO written:', JSON.stringify(out))
    console.log('UNDO errors:', errors)
    expect(out).not.toContain('<<<<<<<')
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// ------------------------------------------------- 6. type then delete back
test('AUDIT type inside a conflict then delete it back', async () => {
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
    // Caret onto the conflicted line, type a char, then delete it again.
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('End')
    await page.keyboard.type('X')
    await page.waitForTimeout(200)
    console.log('TYPEBACK after typing:', await resultLines(page))
    console.log('TYPEBACK save enabled after typing:', await page.getByTestId('merge-save').isEnabled())
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(300)
    console.log('TYPEBACK after backspace:', await resultLines(page))
    console.log('TYPEBACK count:', await page.locator('.merge-count').textContent())
    console.log('TYPEBACK save enabled:', await page.getByTestId('merge-save').isEnabled())
    if (await page.getByTestId('merge-save').isEnabled()) {
      await page.getByTestId('merge-save').click()
      await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
      console.log('TYPEBACK written:', JSON.stringify(readFileSync(file, 'utf8')))
    }
    console.log('TYPEBACK errors:', errors)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// --------------------------------------------------------- 7. 250 conflicts
test('AUDIT a file with 250 conflicts', async () => {
  const many = (word) =>
    Array.from({ length: 250 }, (_, i) => `pad${i}-a\npad${i}-b\n${word}-${i}\npad${i}-c\npad${i}-d`)
      .join('\n') + '\n'
  const { dir, file } = repoWith({
    base: many('base'),
    ours: many('ours'),
    theirs: many('theirs')
  })
  const conflicted = readFileSync(file, 'utf8')
  const n = (conflicted.match(/^<<<<<<< /gm) || []).length
  console.log('MANY conflict count on disk:', n)
  const { app, page, errors } = await openMerge(dir, file)
  try {
    console.log('MANY count text:', await page.locator('.merge-count').textContent())
    const t0 = Date.now()
    await page.getByTestId('merge-all-theirs').click()
    await expect(page.getByTestId('merge-save')).toBeEnabled({ timeout: 60000 })
    console.log('MANY all-theirs took ms:', Date.now() - t0)
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 30000 })
    const out = readFileSync(file, 'utf8')
    console.log('MANY written length:', out.length, 'expected:', many('theirs').length)
    console.log('MANY has markers:', out.includes('<<<<<<<'))
    console.log('MANY errors:', errors)
    expect(out).toBe(many('theirs'))
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// -------------------------------- 8. `<<<<<<<` appearing as ordinary text
test('AUDIT a file whose ordinary text contains marker-shaped lines', async () => {
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
  const raw = readFileSync(file, 'utf8')
  console.log('DOC conflicted-on-disk:\n' + raw)
  const { app, page, errors } = await openMerge(dir, file)
  try {
    const notes = await page.locator('.merge-note').allTextContents()
    console.log('DOC note count:', notes.length, 'text:', JSON.stringify(notes))
    console.log('DOC count text:', await page.locator('.merge-count').textContent())
    console.log('DOC result lines:', await resultLines(page))
    const save = page.getByTestId('merge-save')
    console.log('DOC save enabled at open:', await save.isEnabled())
    if (await save.isEnabled()) {
      await save.click()
      await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
      console.log('DOC WROTE:\n' + readFileSync(file, 'utf8'))
    }
    console.log('DOC errors:', errors)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// -------------------- 8b. empty-ours region, answered twice, next to another
test('AUDIT empty-ours region answered twice, with a second conflict below', async () => {
  const { dir, file } = repoWith({
    base: 'head\nkeep-a\nkeep-b\nx1\nx2\nkeep-c\nkeep-d\nSECOND-base\nkeep-e\ntail\n',
    ours: 'head\nkeep-a\nkeep-b\nkeep-c\nkeep-d\nSECOND-ours\nkeep-e\ntail\n',
    theirs: 'head\nkeep-a\nkeep-b\ny1\ny2\nkeep-c\nkeep-d\nSECOND-theirs\nkeep-e\ntail\n'
  })
  console.log('EMPTY2 conflicted-on-disk:\n' + readFileSync(file, 'utf8'))
  const { app, page, errors } = await openMerge(dir, file)
  try {
    console.log('EMPTY2 count:', await page.locator('.merge-count').textContent())
    // Region 1 (ours emptied): theirs, then change our mind twice.
    await page.getByTestId('merge-take-theirs').click()
    console.log('EMPTY2 after theirs:', await resultLines(page))
    await page.getByTestId('merge-take-ours').click()
    console.log('EMPTY2 after ours:', await resultLines(page))
    await page.getByTestId('merge-take-both').click()
    console.log('EMPTY2 after both:', await resultLines(page))
    await page.getByTestId('merge-take-theirs').click()
    // Region 2, answered after.
    await page.getByTestId('merge-next').click()
    await page.getByTestId('merge-take-theirs').click()
    await expect(page.getByTestId('merge-save')).toBeEnabled()
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
    const out = readFileSync(file, 'utf8')
    console.log('EMPTY2 written:\n' + out)
    console.log('EMPTY2 errors:', errors)
    expect(out).toBe(
      'head\nkeep-a\nkeep-b\ny1\ny2\nkeep-c\nkeep-d\nSECOND-theirs\nkeep-e\ntail\n'
    )
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// ------------------------------- 8c. three conflicts, answered 3rd, 1st, 2nd
test('AUDIT three conflicts answered 3rd, 1st, 2nd', async () => {
  const doc = (a, b, c) =>
    [
      'top',
      'p1',
      'p2',
      `ONE-${a}`,
      'q1',
      'q2',
      'q3',
      'q4',
      'q5',
      `TWO-${b}`,
      'r1',
      'r2',
      'r3',
      'r4',
      'r5',
      `THREE-${c}`,
      's1',
      's2',
      'bottom',
      ''
    ].join('\n')
  const { dir, file } = repoWith({
    base: doc('base', 'base', 'base'),
    ours: doc('ours', 'ours', 'ours'),
    theirs: doc('theirs', 'theirs', 'theirs')
  })
  const on = (readFileSync(file, 'utf8').match(/^<<<<<<< /gm) || []).length
  console.log('THREE conflicts on disk:', on)
  const { app, page, errors } = await openMerge(dir, file)
  try {
    // 3rd
    await page.getByTestId('merge-next').click()
    await page.getByTestId('merge-next').click()
    await page.getByTestId('merge-take-theirs').click()
    // 1st
    await page.getByTestId('merge-next').click()
    await page.getByTestId('merge-take-ours').click()
    // 2nd
    await page.getByTestId('merge-next').click()
    await page.getByTestId('merge-take-both').click()
    await expect(page.getByTestId('merge-save')).toBeEnabled()
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
    const out = readFileSync(file, 'utf8')
    console.log('THREE written:\n' + out)
    console.log('THREE errors:', errors)
    expect(out).toBe(
      [
        'top',
        'p1',
        'p2',
        'ONE-ours',
        'q1',
        'q2',
        'q3',
        'q4',
        'q5',
        'TWO-ours',
        'TWO-theirs',
        'r1',
        'r2',
        'r3',
        'r4',
        'r5',
        'THREE-theirs',
        's1',
        's2',
        'bottom',
        ''
      ].join('\n')
    )
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// --------------------------------------------- 9. cancel after resolving
test('AUDIT cancel after resolving leaves the file byte-identical', async () => {
  const { dir, file } = repoWith(TWO)
  const before = readFileSync(file)
  const { app, page, errors } = await openMerge(dir, file)
  try {
    await page.getByTestId('merge-all-theirs').click()
    await expect(page.getByTestId('merge-save')).toBeEnabled()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('.merge-view')).toHaveCount(0)
    const after = readFileSync(file)
    console.log('CANCEL identical:', after.equals(before))
    console.log('CANCEL errors:', errors)
    expect(after.equals(before)).toBe(true)
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})

// -------------------------------------------------------- 10. mixed EOL
test('AUDIT a genuinely mixed CRLF/LF file', async () => {
  const mk = (mid) => `crlf-one\r\nlf-two\ncrlf-three\r\n${mid}\r\nlf-tail\n`
  const { dir, file } = repoWith({ base: mk('base'), ours: mk('ours'), theirs: mk('theirs') })
  const raw = readFileSync(file)
  console.log('MIXED conflicted-on-disk:', JSON.stringify(raw.toString('utf8')))
  const { app, page, errors } = await openMerge(dir, file)
  try {
    await page.getByTestId('merge-take-theirs').click()
    await expect(page.getByTestId('merge-save')).toBeEnabled()
    await page.getByTestId('merge-save').click()
    await expect(page.locator('.merge-view')).toHaveCount(0, { timeout: 10000 })
    const out = readFileSync(file)
    console.log('MIXED written:', JSON.stringify(out.toString('utf8')))
    console.log('MIXED expected:', JSON.stringify(mk('theirs')))
    console.log('MIXED errors:', errors)
    expect(out.toString('utf8')).toBe(mk('theirs'))
  } finally {
    await app.close().catch(() => {})
    rmSync(dir, { recursive: true, force: true })
  }
})
