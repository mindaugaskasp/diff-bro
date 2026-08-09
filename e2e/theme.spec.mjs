import { rmSync } from 'node:fs'
import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  openSettings
} from './fixtures.mjs'

// Picking a theme must (1) apply to the document immediately and (2) survive a
// relaunch — persistence goes through the main-process data-dir store, not just
// in-memory state, so this drives the whole IPC round-trip. Manages its own
// launch/relaunch against one profile instead of the per-test `app` fixture.
test('a chosen theme applies at once and persists across a relaunch', async () => {
  const userDataDir = freshUserDataDir()
  try {
    let app = await launchApp(userDataDir)
    let page = await firstReadyPage(app)

    // Light is the default ground on a fresh profile.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await openSettings(page)
    await page.getByRole('button', { name: 'Use the Neon theme' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'neon')
    await app.close()

    // Relaunch the same profile: the choice was written to userData and reloads.
    app = await launchApp(userDataDir)
    page = await firstReadyPage(app)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'neon')
    await app.close()
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

// The app defined no Monaco theme at all, so the diff editor — the one surface
// a diff tool is judged on — ignored the palette: every dark theme drew Monaco's
// stock #1e1e1e ground with its stock olive and maroon bands, every light one
// the stock white. Fourteen themes, two appearances. Only a real launch shows
// it: the colours come from Monaco's own stylesheet, not the app's.
test('the diff editor is painted by the theme, not by Monaco stock', async ({ page }) => {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste original text here').fill('one\ntwo\nthree')
  await page.getByPlaceholder('Paste changed text here').fill('one\nTWO!\nthree')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(page.locator('.monaco-diff-editor')).toBeVisible()

  const surfaces = () =>
    page.evaluate(() => {
      const probe = document.createElement('span')
      probe.style.display = 'none'
      document.body.appendChild(probe)
      probe.style.color = 'var(--bg)'
      const bg = getComputedStyle(probe).color
      probe.remove()
      const editor = document.querySelector('.monaco-diff-editor .monaco-editor-background')
      // The BAND, read off the painted pixel: Monaco draws it as a decoration
      // whose colour comes from the theme, and asserting only the ground let a
      // build ship where all four --diff-* tokens were dropped and the stock
      // green and red survived underneath a themed background.
      const band = document.querySelector(
        '.monaco-diff-editor .line-insert, .monaco-diff-editor .char-insert'
      )
      return {
        bg,
        editor: editor && getComputedStyle(editor).backgroundColor,
        band: band && getComputedStyle(band).backgroundColor
      }
    })

  await openSettings(page)
  await page.getByRole('button', { name: 'Use the Matrix theme' }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'matrix')
  await page.waitForTimeout(400)
  const matrix = await surfaces()
  expect(matrix.editor, 'the editor ground must be the theme’s own').toBe(matrix.bg)
  expect(matrix.editor, 'not Monaco stock dark').not.toBe('rgb(30, 30, 30)')

  await openSettings(page)
  await page.getByRole('button', { name: 'Use the Nyan theme' }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nyan')
  await page.waitForTimeout(400)
  const nyan = await surfaces()
  expect(nyan.editor).toBe(nyan.bg)
  // Two dark themes used to be pixel-identical here.
  expect(nyan.editor, 'two themes must not paint the same editor').not.toBe(matrix.editor)

  // And the band itself must come from the palette, not from vs-dark. Monaco's
  // stock inserted band is a green at 20% alpha; a themed one is opaque.
  for (const [name, s] of [
    ['matrix', matrix],
    ['nyan', nyan]
  ]) {
    expect(s.band, `${name} must paint a diff band`).toBeTruthy()
    expect(s.band, `${name} band must not be Monaco stock`).not.toMatch(/155,\s*185,\s*85/)
  }
  expect(nyan.band, 'two themes must not paint the same band').not.toBe(matrix.band)
})
