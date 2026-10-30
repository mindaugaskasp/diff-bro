import { test, expect, clickAppMenuItem, openSide, paneLabel } from './fixtures.mjs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Copying one SIDE puts that file's own text on the real OS clipboard, which is
// the half a unit test cannot see: the write goes main-process (clipboard:write,
// since navigator.clipboard is denied here). So drive it the way a reader does
// and read the clipboard back through Electron.

const LEFT_TEXT = 'one\ntwo\nthree\n'
const RIGHT_TEXT = 'one\nTWO\nthree\n'

function twoFiles() {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-copyside-'))
  const left = join(dir, 'alpha.txt')
  const right = join(dir, 'beta.txt')
  writeFileSync(left, LEFT_TEXT)
  writeFileSync(right, RIGHT_TEXT)
  return { dir, left, right }
}

async function loadPair(app, page, left, right) {
  await openSide(app, page, 'left', left)
  await openSide(app, page, 'right', right)
  await expect(paneLabel(page, 'right')).toHaveText('beta.txt')
}

const readClipboard = (app) => app.evaluate(({ clipboard }) => clipboard.readText())
const clearClipboard = (app) => app.evaluate(({ clipboard }) => clipboard.clear())

// The Edit menu (and so the palette and Cmd+Shift+1/2, which dispatch the same
// two actions) copies each side verbatim. Driven through the menu item rather
// than a keypress: a CDP-injected key never reaches a native accelerator, so
// asserting on one would prove nothing about the binding.
test('the Edit menu copies each side verbatim, not the diff between them', async ({
  app,
  page
}) => {
  const { dir, left, right } = twoFiles()
  try {
    await loadPair(app, page, left, right)

    await clearClipboard(app)
    await clickAppMenuItem(app, 'Left Side')
    await expect.poll(() => readClipboard(app)).toBe(LEFT_TEXT)

    await clearClipboard(app)
    await clickAppMenuItem(app, 'Right Side')
    await expect.poll(() => readClipboard(app)).toBe(RIGHT_TEXT)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
