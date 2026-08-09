import { test, expect, newSnippetButton } from './fixtures.mjs'
import { focusEditor } from './monaco.mjs'

// Photographing a snippet is only real in a launched app: the picture is taken
// by webContents.capturePage in MAIN, the diagram is an SVG Mermaid lays out,
// and the colouring comes from a Monaco grammar that loads asynchronously.
// jsdom has none of the three.

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const DIAGRAM = 'Example — Mermaid diagram'

// Capture lives in the snippet's view window — the row's hover actions carry
// copy/delete only, so the shot starts from where the contents are shown.
async function shoot(page, name) {
  await page.locator('.snippets-section .row', { hasText: name }).click()
  const view = page.getByRole('dialog', { name: 'Snippet', exact: true })
  await view.getByRole('button', { name: 'Capture', exact: true }).click()
  await expect(view).toHaveCount(0)
  return page.getByRole('dialog', { name: 'Export as image' })
}

const reportedSize = async (dialog) =>
  (await dialog.locator('.dialog-note').first().innerText())
    .match(/(\d+) × (\d+)/)
    .slice(1)
    .map(Number)

// Pasted, not typed: Monaco auto-indents every Enter and at this length drops a
// keystroke outright, merging two statements into unparseable Mermaid.
async function createSnippet({ page, app }, name, body) {
  await newSnippetButton(page).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill(name)
  await focusEditor(editor)
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), body)
  await app.evaluate(({ BrowserWindow }) =>
    (BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]).webContents.paste()
  )
  await expect(editor.locator('.view-line').first()).not.toHaveText('')
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()
}

// The whole point of the feature: what leaves the app is the DIAGRAM, not the
// Mermaid source, which is useless in a ticket.
test('a Mermaid snippet is photographed as its rendered diagram', async ({ page }) => {
  // Watch the stage while the shutter is open — afterwards it is already gone.
  await page.evaluate(() => {
    window.__stage = { svg: false, code: false, seen: false }
    window.__timer = setInterval(() => {
      if (!document.querySelector('.content.capturing')) return
      window.__stage.seen = true
      window.__stage.svg ||= !!document.querySelector('[data-capture-stage] svg')
      window.__stage.code ||= !!document.querySelector('[data-capture-stage] .syn-line')
    }, 5)
  })

  const dialog = await shoot(page, DIAGRAM)
  const preview = dialog.locator('.shot img')
  await expect(preview).toBeVisible()

  const stage = await page.evaluate(() => {
    clearInterval(window.__timer)
    return window.__stage
  })
  expect(stage.seen).toBe(true)
  expect(stage.svg).toBe(true) // a diagram was on the stage...
  expect(stage.code).toBe(false) // ...and the source was not

  await expect(preview).toHaveAttribute('alt', `Diagram: ${DIAGRAM}`)

  // Real PNG bytes, at the size the dialog claims.
  const src = await preview.getAttribute('src')
  const bytes = Buffer.from(src.split(',')[1], 'base64')
  expect(bytes.subarray(0, 8).equals(PNG_MAGIC)).toBe(true)
  const [w, h] = await reportedSize(dialog)
  expect(await preview.evaluate((img) => [img.naturalWidth, img.naturalHeight])).toEqual([w, h])
})

// Shooting before Mermaid returns would produce a blank frame — the same class
// of bug that once exported a diff with no highlights at all. Colour is how you
// tell an empty page from a drawn one.
test('the diagram picture is drawn, not an empty frame', async ({ app, page }) => {
  const dialog = await shoot(page, DIAGRAM)
  await expect(dialog.locator('.shot img')).toBeVisible()

  await app.evaluate(({ clipboard }) => clipboard.clear())
  await dialog.getByRole('button', { name: 'Copy image' }).click()
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible()

  const painted = await app.evaluate(({ clipboard }) => {
    const bitmap = clipboard.readImage().toBitmap()
    const seen = new Set()
    for (let i = 0; i < bitmap.length; i += 4) {
      seen.add(`${bitmap[i]},${bitmap[i + 1]},${bitmap[i + 2]}`)
    }
    return seen.size
  })
  // A blank stage is one or two colours; a rendered flowchart has node fills,
  // strokes, arrowheads and antialiased text.
  expect(painted).toBeGreaterThan(20)
})

test('a code snippet is photographed with its colouring and its name', async ({ app, page }) => {
  await createSnippet({ page, app }, 'Deploy config', '{ "replicas": 3, "image": "web:1.2" }')

  const dialog = await shoot(page, 'Deploy config')
  const preview = dialog.locator('.shot img')
  await expect(preview).toBeVisible()
  await expect(preview).toHaveAttribute('alt', 'Snippet: Deploy config')
  await expect(dialog.locator('.dialog-note').first()).toContainText('screenshot of this snippet')

  const [w, h] = await reportedSize(dialog)
  expect(w).toBeGreaterThan(100)
  // Cropped to the snippet, not run to the bottom of an empty column.
  const { paneHeight, dpr } = await page.evaluate(() => ({
    paneHeight: document.querySelector('.content').getBoundingClientRect().height,
    dpr: window.devicePixelRatio
  }))
  expect(h).toBeLessThan(paneHeight * dpr * 0.75)
})

// The reason the stage OVERLAYS the diff column instead of replacing it in the
// router: unmounting DiffViewer rebuilds Monaco, losing the reader's place in a
// comparison that has nothing to do with the snippet they photographed.
test('the live comparison survives the shot, scroll position and all', async ({ page }) => {
  const LEFT = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n')
  const RIGHT = LEFT.replace('line 40', 'line 40 CHANGED')
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill(LEFT)
  await page.getByPlaceholder('Paste changed text here').fill(RIGHT)
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.diff-container')).toBeVisible()

  await page.locator('.editor.modified .view-line').first().click()
  await page.mouse.wheel(0, 900)
  await page.waitForTimeout(300)
  const scrolled = await page.evaluate(
    () => document.querySelector('.editor.modified .view-lines').getBoundingClientRect().top
  )

  const dialog = await shoot(page, DIAGRAM)
  await expect(dialog.locator('.shot img')).toBeVisible()
  await dialog.locator('.dialog-actions').getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toHaveCount(0)

  // Same comparison, same place in it. Identity off the stats, not a changed
  // LINE: Monaco renders only the rows in view, and this change is below them.
  await expect(page.locator('.status-band .add')).toHaveText('1 added')
  await expect(page.locator('.status-band .del')).toContainText('1 removed')
  const after = await page.evaluate(
    () => document.querySelector('.editor.modified .view-lines').getBoundingClientRect().top
  )
  expect(Math.abs(after - scrolled)).toBeLessThan(4)
})

// A masked secret has nothing worth photographing and everything to lose.
test('a secret snippet offers no capture action', async ({ page }) => {
  await newSnippetButton(page).click()
  const editor = page.getByRole('dialog', { name: 'New Snippet' })
  await editor.getByPlaceholder('Snippet name…').fill('Prod API key')
  await editor.locator('.editor').click()
  await page.keyboard.type('sk-live-DEADBEEF')
  await editor.locator('.secret-toggle input[type="checkbox"]').check()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor).toBeHidden()

  await page.locator('.snippets-section .row', { hasText: 'Prod API key' }).click()
  const view = page.getByRole('dialog', { name: 'Snippet', exact: true })
  await expect(view).toBeVisible()
  await expect(view.getByRole('button', { name: 'Capture', exact: true })).toHaveCount(0)
  // ...while an ordinary snippet's view offers it. The ghost Close by its
  // text — the header × carries the same accessible name.
  await view.getByText('Close', { exact: true }).click()
  await page.locator('.snippets-section .row', { hasText: DIAGRAM }).click()
  await expect(
    page
      .getByRole('dialog', { name: 'Snippet', exact: true })
      .getByRole('button', { name: 'Capture', exact: true })
  ).toBeVisible()
})

// Capture moved into the view window; the hover row keeps copy/delete only, so
// the common action never shares a narrow strip with the rare one.
test('the row hover actions carry no capture button', async ({ page }) => {
  const row = page.locator('.snippets-section .row', { hasText: DIAGRAM })
  await row.hover()
  await expect(row.getByRole('button', { name: 'Copy to clipboard' })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Export as image' })).toHaveCount(0)
})

// Mermaid keeps the whole diagram in the DOM, but capturePage only ever sees
// what is composited — so a tall one has to scroll and stitch, exactly as a tall
// diff does.
test('a diagram taller than the pane is stitched, not cut at the fold', async ({ app, page }) => {
  const nodes = Array.from({ length: 60 }, (_, i) => `  N${i} --> N${i + 1}`).join('\n')
  await createSnippet({ page, app }, 'Tall flow', `flowchart TD\n${nodes}`)

  const dialog = await shoot(page, 'Tall flow')
  await expect(dialog.locator('.shot img')).toBeVisible()
  const [, h] = await reportedSize(dialog)

  const { paneHeight, dpr } = await page.evaluate(() => ({
    paneHeight: document.querySelector('.content').getBoundingClientRect().height,
    dpr: window.devicePixelRatio
  }))
  expect(h).toBeGreaterThan(paneHeight * dpr * 1.5)
})

// Viewing a snippet is when you are actually looking at the thing you want a
// picture of — the view window is capture's only home now the row button is
// gone. The view gets out of the way before the shot: a dialog over the diff
// column would be photographed with it (shoot() asserts it closed).
test('a snippet is captured from the view its contents are shown in', async ({ page }) => {
  const dialog = await shoot(page, DIAGRAM)
  const preview = dialog.locator('.shot img')
  await expect(preview).toBeVisible()
  await expect(preview).toHaveAttribute('alt', `Diagram: ${DIAGRAM}`)
  const src = await preview.getAttribute('src')
  expect(Buffer.from(src.split(',')[1], 'base64').subarray(0, 8).equals(PNG_MAGIC)).toBe(true)
})

// Editing is not viewing: the button belongs to the read-only state, beside the
// other things you do WITH a snippet rather than TO it.
test('the capture action is not offered while editing', async ({ page }) => {
  await page.locator('.snippets-section .row', { hasText: DIAGRAM }).click()
  const view = page.getByRole('dialog', { name: 'Snippet', exact: true })
  await view.getByRole('button', { name: 'Edit' }).click()
  await expect(view.getByRole('button', { name: 'Capture', exact: true })).toHaveCount(0)
})
