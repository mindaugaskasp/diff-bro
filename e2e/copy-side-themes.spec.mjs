import { test, expect, openSettings, stubOpenDialog } from './fixtures.mjs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { THEMES } from '../src/renderer/src/utils/themes.js'

// The slot's copy control is the one surface theme-sweep cannot reach: every
// surface there is opened through paste mode, which replaces the slots row, and
// the control only exists once a real FILE is loaded. So the all-20 check lives
// here instead, measuring the same thing the sweep would — the computed colours
// off the live DOM, composited against what is actually behind them.

// It carries an icon, not prose: --text-dim at the mark floor, the same one
// check-theme-depth holds dim ink to.
const DIM = 3.0

const contrastOf = (page, selector) =>
  page.evaluate((sel) => {
    const parse = (c) => (c.match(/[\d.]+/g) ?? []).map(Number)
    const over = (fg, bg) => {
      const a = fg.length > 3 ? fg[3] : 1
      return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a))
    }
    const lum = (rgb) => {
      const [r, g, b] = rgb.map((v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    // Walk up compositing every translucent layer, or a veil like --btn-face
    // measures against nothing and reads as perfect contrast.
    const groundOf = (el) => {
      let acc = [255, 255, 255]
      const chain = []
      for (let n = el; n; n = n.parentElement) chain.unshift(n)
      for (const n of chain) {
        const bg = parse(getComputedStyle(n).backgroundColor)
        if (bg.length >= 3 && (bg.length < 4 || bg[3] > 0)) acc = over(bg, acc)
      }
      return acc
    }
    const el = document.querySelector(sel)
    if (!el) return null
    const ground = groundOf(el.parentElement ?? el)
    const surface = (() => {
      const own = parse(getComputedStyle(el).backgroundColor)
      return own.length >= 3 && (own.length < 4 || own[3] > 0) ? over(own, ground) : ground
    })()
    const ink = over(parse(getComputedStyle(el).color), surface)
    const [a, b] = [lum(ink), lum(surface)].sort((x, y) => y - x)
    return (a + 0.05) / (b + 0.05)
  }, selector)

test('the slot copy control is legible on every theme', async ({ app, page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'diffbro-copyside-themes-'))
  const left = join(dir, 'alpha.txt')
  const right = join(dir, 'beta.txt')
  writeFileSync(left, 'one\ntwo\n')
  writeFileSync(right, 'one\nTWO\n')

  try {
    await stubOpenDialog(app, left)
    await page.locator('.slot[data-side="left"] .open').click()
    await stubOpenDialog(app, right)
    await page.locator('.slot[data-side="right"] .open').click()
    await expect(page.locator('.slot[data-side="left"] .name')).toHaveText('alpha.txt')

    const failures = []
    const rows = []
    for (const theme of THEMES) {
      await openSettings(page)
      const dlg = page.getByRole('dialog', { name: 'Settings' })
      await dlg.getByRole('button', { name: `Use the ${theme.label} theme` }).click()
      await page.keyboard.press('Escape')
      await dlg.waitFor({ state: 'hidden' })
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id)

      // Hovered is the only state it is ever seen in. .btn transitions colour
      // over 120ms and getComputedStyle reports the INTERPOLATED value, so
      // measuring straight after the hover reads a colour no one ever sees.
      await page.locator('.slot[data-side="left"]').hover()
      await page.waitForTimeout(250)
      const ratio = await contrastOf(page, '.slot[data-side="left"] .copy')
      // The file name beside it is --text on the same ground and is already held
      // above the reading floor, so it calibrates the instrument: if this ever
      // dips, the measurement is wrong before the control is.
      const control = await contrastOf(page, '.slot[data-side="left"] .name')
      rows.push(`${theme.id.padEnd(10)} copy ${ratio?.toFixed(2)}  name ${control?.toFixed(2)}`)
      if (!(control >= 4.5)) failures.push(`${theme.id}: INSTRUMENT name=${control?.toFixed(2)}`)
      if (!(ratio >= DIM)) failures.push(`${theme.id}: ${ratio?.toFixed(2)}`)
    }

    expect(failures, `measured:\n${rows.join('\n')}\n`).toEqual([])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
