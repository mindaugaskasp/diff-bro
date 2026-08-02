import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test, expect, clickAppMenuItem, stubSaveDialog } from './fixtures.mjs'

// Exporting a saved diff as an image is only real in a launched app: the picture
// is taken by webContents.capturePage in the MAIN process, and copying it puts a
// bitmap on the OS clipboard. jsdom has neither a compositor nor a clipboard, so
// everything below the preload boundary is unverifiable there.

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// Paste-compare something, then save it — the sidebar row is the export's entry
// point, and only a SAVED diff has one.
async function saveDiff(page, name, texts) {
  const [left, right] = texts ?? ['alpha\nbravo\ncharlie', 'alpha\nBRAVO!\ncharlie']
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Save diff' })
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('li.diff', { hasText: name })).toBeVisible()
}

async function openImageExport(page, name) {
  const row = page.locator('li.diff', { hasText: name })
  await row.hover()
  await row.getByRole('button', { name: 'Export as image' }).click()
  return page.getByRole('dialog', { name: 'Export as image' })
}

test('a saved diff exports a real screenshot of the diff view', async ({ page }) => {
  const NAME = 'E2E image diff'
  await saveDiff(page, NAME)
  const dialog = await openImageExport(page, NAME)

  const preview = dialog.locator('.shot img')
  await expect(preview).toBeVisible()

  const src = await preview.getAttribute('src')
  expect(src.startsWith('data:image/png;base64,')).toBe(true)

  // A genuine capture, not a placeholder: real PNG bytes with real dimensions.
  const bytes = Buffer.from(src.split(',')[1], 'base64')
  expect(bytes.subarray(0, 8).equals(PNG_MAGIC)).toBe(true)
  expect(bytes.length).toBeGreaterThan(2000)

  const box = await preview.boundingBox()
  expect(box.width).toBeGreaterThan(100)

  // The size the dialog reports must be the size the file actually has — this
  // is what caught main double-counting the HiDPI scale factor.
  const shown = await dialog.locator('.dialog-note').innerText()
  const [w, h] = shown
    .match(/(\d+) × (\d+)/)
    .slice(1)
    .map(Number)
  const natural = await preview.evaluate((img) => [img.naturalWidth, img.naturalHeight])
  expect(natural).toEqual([w, h])

  // "High definition": the picture is the CSS region multiplied by the display's
  // pixel ratio, so a Retina export is 2× the on-screen size (and 1× elsewhere,
  // where this still pins the width to the region rather than to a guess).
  const { cssWidth, dpr } = await page.evaluate(() => ({
    cssWidth: document.querySelector('.content').getBoundingClientRect().width,
    dpr: window.devicePixelRatio
  }))
  expect(Math.abs(w - Math.round(cssWidth) * dpr)).toBeLessThanOrEqual(2)
})

test('the screenshot is of the saved diff, and excludes the app chrome', async ({ page }) => {
  await saveDiff(page, 'First diff')

  // A second, different comparison is left on screen unsaved.
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill('zulu')
  await page.getByPlaceholder('Paste changed text here').fill('zulu\nyankee')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('yankee').first()).toBeVisible()

  const dialog = await openImageExport(page, 'First diff')

  // The SAVED diff is what got photographed — the preview names it and carries
  // a real picture.
  const preview = dialog.locator('.shot img')
  await expect(preview).toHaveAttribute('alt', 'Diff view of First diff')
  await expect(preview).toHaveJSProperty('complete', true)

  // ...and the unsaved comparison the user was working on is still there.
  // Exporting used to replace it AND mark it saved, so it vanished with no
  // discard prompt.
  await expect(page.getByText('yankee').first()).toBeVisible()
  await expect(page.getByText('BRAVO!')).toHaveCount(0)

  // The toast and the shortcut bar float INSIDE the captured column. The store
  // test proves the flag is up while the shutter is open; this proves the flag
  // actually removes them, which only real CSS can answer.
  const hidden = await page.evaluate(() => {
    const content = document.querySelector('.content')
    const seen = (sel) => {
      const el = document.querySelector(sel)
      return el ? getComputedStyle(el).display !== 'none' : false
    }
    content.classList.add('capturing')
    const during = { notice: seen('.notice'), bar: seen('.shortcut-bar') }
    content.classList.remove('capturing')
    return { during, barNormally: seen('.shortcut-bar') }
  })
  expect(hidden.during).toEqual({ notice: false, bar: false })
  expect(hidden.barNormally).toBe(true) // and it comes back afterwards
})

test('the capture is cropped to the diff, not to the empty pane below it', async ({ page }) => {
  const NAME = 'E2E short diff'
  await saveDiff(page, NAME) // three lines
  const dialog = await openImageExport(page, NAME)
  const [w, h] = (await dialog.locator('.dialog-note').innerText())
    .match(/(\d+) × (\d+)/)
    .slice(1)
    .map(Number)

  // A three-line diff must not be exported as a full-height, mostly-blank page:
  // the picture is wider than it is tall once the empty pane is cropped away.
  expect(h).toBeLessThan(w)

  const paneHeight = await page.evaluate(
    () => document.querySelector('.content').getBoundingClientRect().height
  )
  const scale = await page.evaluate(() => window.devicePixelRatio)
  expect(h).toBeLessThan(paneHeight * scale * 0.75)
})

test('copy puts a bitmap on the OS clipboard, and save writes a PNG', async ({ app, page }) => {
  const NAME = 'E2E clipboard image'
  await saveDiff(page, NAME)
  const dialog = await openImageExport(page, NAME)

  // Clipboard: a trusted-click copy goes through main (navigator.clipboard is
  // blocked by the deny-all permission handler).
  await app.evaluate(({ clipboard }) => clipboard.clear())
  await dialog.getByRole('button', { name: 'Copy image' }).click()
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible()
  const clipped = await app.evaluate(({ clipboard }) => {
    const image = clipboard.readImage()
    return { empty: image.isEmpty(), size: image.getSize() }
  })
  expect(clipped.empty).toBe(false)
  expect(clipped.size.width).toBeGreaterThan(100)

  // Save: main writes the same capture to the chosen path.
  const out = join(tmpdir(), `diffbro-e2e-${Date.now()}.png`)
  await stubSaveDialog(app, out)
  await dialog.getByRole('button', { name: 'Save PNG…' }).click()
  await expect(page.getByText(out)).toBeVisible()
  try {
    const written = readFileSync(out)
    expect(written.subarray(0, 8).equals(PNG_MAGIC)).toBe(true)
    expect(written.length).toBeGreaterThan(2000)
  } finally {
    rmSync(out, { force: true })
  }
})

test('closing the preview makes main drop the captured bitmap', async ({ page }) => {
  const NAME = 'E2E forget image'
  await saveDiff(page, NAME)
  const dialog = await openImageExport(page, NAME)
  await dialog.locator('.dialog-actions').getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toHaveCount(0)

  // Nothing is held any more, so a copy has nothing to put on the clipboard.
  const res = await page.evaluate(() => window.api.copyDiffImage())
  expect(res).toEqual({ ok: false, error: 'nothing-captured' })
})

// A 300-line comparison is far taller than any window, so this is the one shape
// a single capturePage can never cover: Monaco keeps no offscreen lines in the
// DOM, so the export has to scroll and stitch or it stops at the fold.
const TALL_LEFT = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join('\n')
const TALL_RIGHT = TALL_LEFT.split('\n')
  .map((l, i) => (i % 50 === 7 ? `${l} CHANGED` : l))
  .join('\n')

test('a diff taller than the pane is exported whole, not cropped at the fold', async ({ page }) => {
  const NAME = 'E2E tall diff'
  await saveDiff(page, NAME, [TALL_LEFT, TALL_RIGHT])
  const dialog = await openImageExport(page, NAME)

  const [, h] = (await dialog.locator('.dialog-note').first().innerText())
    .match(/(\d+) × (\d+)/)
    .slice(1)
    .map(Number)

  const { paneHeight, dpr } = await page.evaluate(() => ({
    paneHeight: document.querySelector('.content').getBoundingClientRect().height,
    dpr: window.devicePixelRatio
  }))
  // Comfortably more than one screenful: the stitch happened. A single
  // capturePage is bounded by the pane, so this can only pass if the export
  // scrolled through the diff and joined the strips.
  expect(h).toBeGreaterThan(paneHeight * dpr * 1.5)
})

test('the exported picture actually carries the diff highlighting', async ({ app, page }) => {
  const NAME = 'E2E highlighted diff'
  await saveDiff(page, NAME)
  const dialog = await openImageExport(page, NAME)

  await app.evaluate(({ clipboard }) => clipboard.clear())
  await dialog.getByRole('button', { name: 'Copy image' }).click()
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible()

  // Monaco computes a diff in a WORKER; shooting before it returns produced a
  // picture of the two files with no add/remove tints at all, which reads as
  // "there are no differences". Those tints are the only strongly coloured
  // thing in the frame, so their absence is measurable: count pixels whose
  // channels are far enough apart to be a colour rather than grey text.
  const colouredPixels = await app.evaluate(({ clipboard }) => {
    const bitmap = clipboard.readImage().toBitmap()
    let n = 0
    for (let i = 0; i < bitmap.length; i += 4) {
      const b = bitmap[i]
      const g = bitmap[i + 1]
      const r = bitmap[i + 2]
      if (Math.max(r, g, b) - Math.min(r, g, b) > 24) n++
    }
    return n
  })
  expect(colouredPixels).toBeGreaterThan(500)
})

// Selecting lines and exporting just those. The band is derived from Monaco's
// own selection geometry, which jsdom cannot produce — only a real editor knows
// where line 7 sits, so this is the one place the feature is actually verified.
async function pasteCompare(page, left, right) {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill(left)
  await page.getByPlaceholder('Paste changed text here').fill(right)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.diff-container')).toBeVisible()
}

// The three actions read as one set; each shrink-wrapping its own label left
// "Close" half the width of "Copy image".
test("the export dialog's actions share a width", async ({ page }) => {
  await saveDiff(page, 'E2E button widths')
  const dialog = await openImageExport(page, 'E2E button widths')
  await expect(dialog.locator('.shot img')).toBeVisible()
  const widths = await dialog
    .locator('.dialog-actions .btn')
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)))
  expect(widths.length).toBe(3)
  expect(new Set(widths).size).toBe(1)
})

const shotHeight = async (page) => {
  const dialog = page.getByRole('dialog', { name: 'Export as image' })
  await expect(dialog.locator('.shot img')).toBeVisible()
  const [, h] = (await dialog.locator('.dialog-note').first().innerText())
    .match(/(\d+) × (\d+)/)
    .slice(1)
    .map(Number)
  await dialog.locator('.dialog-actions').getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toHaveCount(0)
  return h
}

test('selected lines are exported on their own, not the whole diff', async ({ page }) => {
  await pasteCompare(page, TALL_LEFT, TALL_RIGHT)

  // Baseline: no selection captures everything.
  await page.getByRole('button', { name: 'Capture', exact: true }).click()
  const whole = await shotHeight(page)

  // Select six lines in the modified pane: click one, then extend five rows.
  await page.locator('.editor.modified .view-line').nth(2).click()
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowDown')

  const { header, lineHeight, dpr } = await page.evaluate(() => {
    const content = document.querySelector('.content').getBoundingClientRect()
    const pane = document.querySelector('.diff-container').getBoundingClientRect()
    const line = document.querySelector('.editor.modified .view-line').getBoundingClientRect()
    return { header: pane.top - content.top, lineHeight: line.height, dpr: window.devicePixelRatio }
  })

  await page.getByRole('button', { name: 'Capture', exact: true }).click()
  const selected = await shotHeight(page)

  // The picture is the file-slots header plus exactly the six chosen lines.
  expect(selected).toBeCloseTo((header + 6 * lineHeight) * dpr, -1)
  // And nothing like the whole 300-line diff.
  expect(selected).toBeLessThan(whole / 4)
})

test('the toolbar export needs a comparison, and covers everything without a selection', async ({
  page
}) => {
  const button = page.getByRole('button', { name: 'Capture', exact: true })
  await expect(button).toBeDisabled() // nothing loaded yet

  await pasteCompare(page, 'alpha\nbravo\ncharlie', 'alpha\nBRAVO!\ncharlie')
  await expect(button).toBeEnabled()
  await button.click()
  expect(await shotHeight(page)).toBeGreaterThan(0)
})

// Each pane keeps its own selection and neither clears the other's, so exporting
// a range on one side and then selecting on the other re-shot the stale lines.
test('a fresh selection replaces the previous one, on either side', async ({ page }) => {
  await pasteCompare(page, TALL_LEFT, TALL_RIGHT)

  const { lineHeight, header, dpr } = await page.evaluate(() => {
    const content = document.querySelector('.content').getBoundingClientRect()
    const pane = document.querySelector('.diff-container').getBoundingClientRect()
    const line = document.querySelector('.editor.modified .view-line').getBoundingClientRect()
    return { lineHeight: line.height, header: pane.top - content.top, dpr: window.devicePixelRatio }
  })
  const linesIn = (h) => Math.round((h / dpr - header) / lineHeight)

  // Three lines on the right.
  await page.locator('.editor.modified .view-line').nth(1).click()
  for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowDown')
  await page.getByRole('button', { name: 'Capture', exact: true }).click()
  expect(linesIn(await shotHeight(page))).toBe(3)

  // Now seven on the LEFT — the right pane still holds its own selection.
  await page.locator('.editor.original .view-line').nth(1).click()
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowDown')
  await page.getByRole('button', { name: 'Capture', exact: true }).click()
  expect(linesIn(await shotHeight(page))).toBe(7)

  // Collapsing back to a caret means "not those lines any more".
  await page.locator('.editor.original .view-line').nth(1).click()
  await page.getByRole('button', { name: 'Capture', exact: true }).click()
  expect(linesIn(await shotHeight(page))).toBeGreaterThan(20)
})

test('the selection highlight is hidden while the shutter is open', async ({ page }) => {
  await pasteCompare(page, TALL_LEFT, TALL_RIGHT)
  await page.locator('.editor.modified .view-line').nth(1).click()
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowDown')

  // The selection is how the lines were CHOSEN; in the picture it is a slab over
  // the very text being exported. Asserted as computed style rather than by
  // pixel colour: clicking the toolbar unfocuses Monaco, which repaints the
  // selection in its inactive grey, so no single colour identifies it.
  const shown = await page.evaluate(() => {
    const content = document.querySelector('.content')
    const seen = (sel) => {
      const el = document.querySelector(sel)
      return el ? getComputedStyle(el).display !== 'none' : null
    }
    const before = {
      selection: seen('.editor.modified .selected-text'),
      cursor: seen('.editor.modified .cursor')
    }
    content.classList.add('capturing')
    const during = {
      selection: seen('.editor.modified .selected-text'),
      cursor: seen('.editor.modified .cursor')
    }
    content.classList.remove('capturing')
    return { before, during }
  })

  expect(shown.before.selection).toBe(true) // there really is a slab to hide
  expect(shown.during).toEqual({ selection: false, cursor: false })
})

// Monaco computes its diff in a worker and reports nothing until that returns.
// Treating "nothing yet" as "no changes" flashed the identical banner over
// every diff as it opened — a transient no polling assertion would catch, so
// this records every mutation instead of sampling.
test('opening a saved diff never flashes "both sides are identical"', async ({ page }) => {
  await saveDiff(page, 'Flash check', [TALL_LEFT, TALL_RIGHT])
  const row = page.locator('li.diff', { hasText: 'Flash check' })

  await page.evaluate(() => {
    window.__identicalSeen = false
    const seen = () => {
      if (document.querySelector('.identical-row')) window.__identicalSeen = true
    }
    seen()
    new MutationObserver(seen).observe(document.body, { childList: true, subtree: true })
  })

  // Click it while the very same comparison is already on screen — the case
  // where nothing about the diff actually changes.
  await row.locator('.stack').click()
  await expect(page.getByText('line 8 CHANGED').first()).toBeVisible()
  await page.waitForTimeout(600)

  expect(await page.evaluate(() => window.__identicalSeen)).toBe(false)
})

test('two genuinely identical sides still say so', async ({ page }) => {
  await pasteCompare(page, 'same\nlines', 'same\nlines')
  await expect(page.locator('.identical-row')).toBeVisible()
})

// The shutter captures a page-coordinate rect, so anything floating over the
// diff area lands in the picture. A click on the Image button dismisses its own
// tooltip (pointerdown), but triggering the export from the application menu
// never touches the pointer — the tip stays up, right over the top of the region
// being photographed. `.capturing` cannot reach it either: the tooltip is
// teleported to <body>, outside the region's element tree.
test('a hovering tooltip is not photographed with the diff', async ({ app, page }) => {
  await page.getByRole('button', { name: 'Paste text' }).click()
  await page.getByPlaceholder('Paste original text here').fill('alpha\nbeta')
  await page.getByPlaceholder('Paste changed text here').fill('alpha\nGAMMA')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.diff-container')).toBeVisible()

  await page.getByRole('button', { name: /^Capture/ }).hover()
  await expect(page.locator('.tip-bubble')).toBeVisible()

  // Sample the DOM while the shutter is open: `.content.capturing` is exactly
  // that window, and nothing may float over the region during it. Checking only
  // after the dialog appears proves nothing — opening it steals focus, which
  // dismisses the tip long after the picture was already taken.
  await page.evaluate(() => {
    window.__tipLeak = false
    window.__tipTimer = setInterval(() => {
      if (document.querySelector('.content.capturing') && document.querySelector('.tip-bubble')) {
        window.__tipLeak = true
      }
    }, 5)
  })

  // The menu path leaves the pointer — and the tip — exactly where they were.
  await clickAppMenuItem(app, 'Export Diff as Image…')
  await expect(page.getByRole('dialog', { name: 'Export as image' })).toBeVisible()

  const leaked = await page.evaluate(() => {
    clearInterval(window.__tipTimer)
    return window.__tipLeak
  })
  expect(leaked).toBe(false)
})

// The truncation and hidden-column notices are prose with a <strong> in them.
// As a flex container the paragraph made every text run its own column, so the
// sentence came apart into three pieces.
test('a warning note reads as one sentence, not as columns', async ({ page }) => {
  await saveDiff(page, 'E2E warn note')
  const dialog = await openImageExport(page, 'E2E warn note')
  await expect(dialog).toBeVisible()

  const laidOut = await page.evaluate(() => {
    // Render the same note the dialog uses, with the same classes.
    const p = document.createElement('p')
    p.className = 'dialog-note warn'
    p.innerHTML = 'Raise <strong id="probe">Max diff image height</strong> in Settings to capture.'
    document.querySelector('.dialog')?.appendChild(p)
    const strong = p.querySelector('#probe').getBoundingClientRect()
    const box = p.getBoundingClientRect()
    const display = getComputedStyle(p).display
    p.remove()
    return { display, strongLeft: strong.left, boxLeft: box.left, strongWidth: strong.width }
  })
  expect(laidOut.display).not.toBe('flex')
  // Inline flow: the bold run starts after the text before it, not in its own
  // column pinned away from the paragraph's edge.
  expect(laidOut.strongLeft).toBeGreaterThan(laidOut.boxLeft)
})
