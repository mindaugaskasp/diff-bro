import { test, openSettings, clickAppMenuItem } from '../../e2e/fixtures.mjs'
import { mkdirSync } from 'node:fs'

// #144 slice 11: where System sits in the theme picker.
const OUT = 'design/render/out/system-theme'

const SYSTEM_TILE = () => {
  const lightTile = document.querySelector('.theme-tile')
  const tile = lightTile.cloneNode(true)
  tile.classList.add('active')
  tile.querySelector('.specimen').style.background =
    'linear-gradient(90deg, #ffffff 50%, #161b22 50%)'
  tile.querySelector('.tile-name').firstChild.textContent = 'System '
  document.querySelectorAll('.theme-tile.active').forEach((t) => {
    t.classList.remove('active')
    t.querySelector('.tile-check')?.remove()
  })
  const grid = lightTile.closest('.theme-grid').cloneNode(false)
  grid.append(tile)
  lightTile.closest('section').querySelector('.group-label').before(grid)
}

const SYSTEM_TOGGLE = () => {
  const label = document.querySelector('.settings-appearance .group-label')
  const row = document.createElement('label')
  row.className = 'row'
  row.style.cssText =
    'display:flex;flex-direction:row;align-items:center;gap:10px;margin:6px 0 10px'
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.checked = true
  const text = document.createElement('span')
  text.textContent = 'Match the system appearance'
  row.append(box, text)
  label.before(row)
  document.querySelectorAll('.theme-tile.active').forEach((t) => {
    t.classList.remove('active')
    t.querySelector('.tile-check')?.remove()
  })
  document.querySelectorAll('.settings-appearance .theme-grid').forEach((g) => {
    g.style.opacity = '0.45'
  })
}

const VARIANTS = { today: null, tile: SYSTEM_TILE, toggle: SYSTEM_TOGGLE }

for (const theme of ['light', 'dark']) {
  test(`system theme ${theme}`, async ({ app, page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1280, height: 800 })
    if (theme === 'dark') await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
    for (const [variant, patch] of Object.entries(VARIANTS)) {
      await openSettings(page)
      if (patch) await page.evaluate(patch)
      await page.mouse.move(1270, 790)
      await page.waitForTimeout(200)
      await page.screenshot({ path: `${OUT}/${variant}-${theme}.png` })
      await page.keyboard.press('Escape')
      const discard = page.getByRole('button', { name: 'Discard', exact: false })
      if (await discard.count()) await discard.first().click()
      await page.waitForTimeout(200)
    }
  })
}
