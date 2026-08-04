import { test, expect, stubOpenDialog } from './fixtures.mjs'
import { mkdtempSync, rmSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The streamed path can only be proven by a real launch. Everything that makes
// it work — the main-process line index, the windowed IPC reads, and a
// virtualized list that keeps millions of rows out of the DOM — needs a real
// filesystem and real layout. jsdom has neither.
//
// So: build files genuinely past the 32 MB threshold in src/main/files.js, open
// them through the (stubbed) native dialog, and assert the streamed viewer took
// over from Monaco.

// Comfortably past STREAM_THRESHOLD_BYTES (32 MB) without making the fixture
// enormous. Every line is unique so the alignment has real anchors to find.
const TARGET_BYTES = 34 * 1024 * 1024
const FILLER = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do'
// Padded to FILLER's width so the two files stay the same size line for line —
// a length difference would shift the line COUNT and blur what is being asserted.
const EDITED = 'THIS LINE WAS EDITED ON THE RIGHT'.padEnd(FILLER.length, '.')
// `line ` + 9 digits + ' ' + body + '\n'
const LINE_BYTES = 5 + 9 + 1 + FILLER.length + 1
// A fixed COUNT, not a byte budget: both files must have identical line counts.
const LINE_COUNT = Math.ceil(TARGET_BYTES / LINE_BYTES)

// Written a batch at a time: one 34 MB string would be built in memory, which is
// the very thing this feature exists to avoid.
function writeBigFile(path, { editAt = -1 } = {}) {
  const fd = openSync(path, 'w')
  try {
    for (let line = 0; line < LINE_COUNT;) {
      let batch = ''
      const until = Math.min(LINE_COUNT, line + 20_000)
      for (; line < until; line++) {
        batch += `line ${String(line).padStart(9, '0')} ${line === editAt ? EDITED : FILLER}\n`
      }
      writeSync(fd, batch)
    }
  } finally {
    closeSync(fd)
  }
  return LINE_COUNT
}

test('compares two files too large to hold, streamed', async ({ app, page }) => {
  test.setTimeout(180_000)
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-streamed-'))
  const leftPath = join(dir, 'huge-left.log')
  const rightPath = join(dir, 'huge-right.log')
  // Identical except one edited line, so the alignment has an unambiguous answer.
  const EDIT_LINE = 5000
  const lines = writeBigFile(leftPath)
  writeBigFile(rightPath, { editAt: EDIT_LINE })

  try {
    await stubOpenDialog(app, [leftPath])
    await page.locator('.slot[data-side="left"]').click()
    await expect(page.locator('.slot[data-side="left"] .name')).toHaveText('huge-left.log')

    await stubOpenDialog(app, [rightPath])
    await page.locator('.slot[data-side="right"]').click()

    // --- the streamed viewer took over, and says so -----------------------
    const marker = page.locator('.stream-mark')
    await expect(marker).toBeVisible()
    await expect(marker.locator('.mark-title')).toHaveText('Streamed')
    // The honest user-visible fact, not a security claim.
    await expect(marker.locator('.mark-why')).toContainText('Read from disk as you scroll')
    await expect(marker.locator('.mark-limits')).toContainText('unavailable')
    // Monaco must NOT have mounted for this comparison.
    await expect(page.locator('.diff-container')).toHaveCount(0)

    const rows = page.locator('.stream-rows')
    await expect(rows).toBeVisible()
    // Indexing is done once real rows exist.
    await expect(page.locator('.srow').first()).toBeVisible({ timeout: 120_000 })

    // --- the scroller measures the WHOLE file, not the rendered window ----
    // Polled, not sampled once: the spacers only reach full height after the
    // box has been measured, and under load that lands a frame or two late.
    const measure = () =>
      rows.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        rendered: el.querySelectorAll('.srow').length
      }))
    // Explicit, not the config's 8s default: this lands after a 68 MB file has
    // been indexed, and the box is measured a frame or two after that.
    await expect
      .poll(async () => (await measure()).scrollHeight, { timeout: 30_000 })
      .toBeGreaterThan(lines * 10)
    const geometry = await measure()
    // ~690k lines at 18px each: the scrollbar must reflect all of it.
    expect(geometry.scrollHeight).toBeGreaterThan(lines * 10)
    expect(geometry.clientHeight).toBeLessThan(geometry.scrollHeight / 100)

    // --- but only a window of rows is actually in the DOM -----------------
    // This is the whole point: a viewport plus overscan, never the file.
    expect(geometry.rendered).toBeGreaterThan(0)
    expect(geometry.rendered).toBeLessThan(300)

    // --- every row is exactly one height, or the spacers lie --------------
    const heights = await page
      .locator('.srow')
      .evaluateAll((els) => [
        ...new Set(els.map((el) => Math.round(el.getBoundingClientRect().height)))
      ])
    expect(heights).toHaveLength(1)

    // --- the status strip reports the real line counts --------------------
    // These three wait on WORK, not on layout: the counts appear only once main
    // has hashed and aligned ~690k lines on both sides. Eight seconds is
    // generous on an idle box and tight at the end of a long suite, which is the
    // shape of a flake rather than of a bug.
    const DIFFED = { timeout: 60_000 }
    await expect(page.locator('.status-band .band-end')).toContainText(
      lines.toLocaleString(),
      DIFFED
    )
    // One line differs on each side.
    await expect(page.locator('.status-band .add')).toHaveText('1 added', DIFFED)
    await expect(page.locator('.status-band .del')).toContainText('1 removed', DIFFED)

    // --- the change is reachable, and both panes agree on the row ---------
    // Sampling the two panes in ONE evaluateAll: two sequential reads can
    // straddle a Vue re-render and compare different frames.
    await rows.evaluate((el, top) => el.scrollTo({ top }), EDIT_LINE * 18 - 100)
    const edited = page.locator('.srow', { has: page.locator('.txt.add') }).first()
    await expect(edited).toBeVisible({ timeout: 30_000 })
    // The row's TEXT arrives on an IPC round trip after the row itself does,
    // so the cells are briefly empty — poll for the content, don't sample once.
    const readPair = () =>
      edited.evaluateAll((els) => {
        const cells = els[0]?.querySelectorAll('.txt') ?? []
        return { left: cells[0]?.textContent ?? '', right: cells[1]?.textContent ?? '' }
      })
    await expect
      .poll(async () => (await readPair()).right, { timeout: 30_000 })
      .toContain('THIS LINE WAS EDITED')
    const pair = await readPair()
    expect(pair.right).toContain('THIS LINE WAS EDITED')
    expect(pair.left).not.toContain('THIS LINE WAS EDITED')
    expect(pair.left).toContain(String(EDIT_LINE).padStart(9, '0'))

    // --- scrolling reaches the very end -----------------------------------
    await rows.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
    // Read in ONE evaluate: the spacers are siblings of the rows, so the last
    // ROW has to be picked out of the list rather than by a CSS position.
    const readEnd = () =>
      rows.evaluate((el) => {
        const all = [...el.querySelectorAll('.srow')]
        return {
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          rendered: all.length,
          lastLine: all.at(-1)?.querySelector('.ln')?.textContent?.trim()
        }
      })
    // scrollTop moves synchronously; the WINDOW does not. The list re-renders on
    // the scroll event and fills the rows from disk after that, so sampling here
    // reads the previous window — the one parked at the edited line. That is the
    // intermittent this test kept failing on: it reported line 5039 for a file
    // ending at 463008, and only when the re-render lost the race.
    await expect
      .poll(async () => (await readEnd()).lastLine, { timeout: 30_000 })
      .toBe(String(lines))
    const atEnd = await readEnd()
    expect(atEnd.scrollTop + atEnd.clientHeight).toBeGreaterThan(atEnd.scrollHeight - 40)
    // The last row is the file's last LINE — the window really moved that far.
    expect(Number(atEnd.lastLine)).toBe(lines)
    // Still only a window in the DOM after all that scrolling.
    expect(atEnd.rendered).toBeLessThan(300)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('disables what a streamed comparison cannot do, and says why', async ({ app, page }) => {
  test.setTimeout(180_000)
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-streamed-gate-'))
  const leftPath = join(dir, 'a.log')
  const rightPath = join(dir, 'b.log')
  writeBigFile(leftPath)
  writeBigFile(rightPath, { editAt: 100 })

  try {
    await stubOpenDialog(app, [leftPath])
    await page.locator('.slot[data-side="left"]').click()
    await stubOpenDialog(app, [rightPath])
    await page.locator('.slot[data-side="right"]').click()
    await expect(page.locator('.stream-mark')).toBeVisible()

    const save = page.getByRole('button', { name: 'Save', exact: true })
    const share = page.getByRole('button', { name: 'Share', exact: true })
    const copy = page.getByRole('button', { name: 'Copy diff' })

    // Disabled, not silently broken.
    await expect(save).toBeDisabled()
    await expect(share).toBeDisabled()
    await expect(copy).toBeDisabled()

    // Each says WHY, in terms of the consequence rather than the mechanism.
    await expect(save).toHaveAttribute('data-tip', /Too large to save/)
    await expect(share).toHaveAttribute('data-tip', /Too large to share/)
    await expect(copy).toHaveAttribute('data-tip', /Too large to copy/)

    // Image export stays available: the viewer registers a real scroller.
    await expect(page.getByRole('button', { name: 'Capture' })).toBeEnabled()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a normal-sized file is NOT streamed', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-small-'))
  const leftPath = join(dir, 'small-a.txt')
  const rightPath = join(dir, 'small-b.txt')
  writeFileSync(leftPath, 'alpha\nbeta\ngamma\n')
  writeFileSync(rightPath, 'alpha\nZEBRA\ngamma\n')

  try {
    await stubOpenDialog(app, [leftPath])
    await page.locator('.slot[data-side="left"]').click()
    await stubOpenDialog(app, [rightPath])
    await page.locator('.slot[data-side="right"]').click()

    // The threshold sits well above ordinary files: this one keeps the full
    // editor, and everything that goes with it.
    await expect(page.locator('.diff-container')).toBeVisible()
    await expect(page.locator('.stream-mark')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
