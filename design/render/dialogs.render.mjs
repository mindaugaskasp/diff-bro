import {
  test,
  expect,
  showPanel,
  clickAppMenuItem,
  openSettings,
  saveSettings
} from '../../e2e/fixtures.mjs'
import { mkdirSync } from 'node:fs'

// #144 slice 10: the sheet, quiet fields and pinned actions.
const OUT = 'design/render/out/dialogs'

async function openTool(page, name) {
  await showPanel(page, 'tools')
  await page.locator('.tt-tile', { hasText: name }).click()
  return page.getByRole('dialog', { name })
}

for (const theme of ['light', 'dark', 'contrast']) {
  test(`dialogs ${theme}`, async ({ app, page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1280, height: 800 })
    if (theme === 'dark') await clickAppMenuItem(app, 'Toggle Light/Dark Theme')
    if (theme === 'contrast') {
      await openSettings(page)
      await page.locator('.theme-tile', { hasText: 'Contrast' }).first().click()
      await saveSettings(page)
    }
    const json = await openTool(page, 'JSON')
    await json
      .getByRole('textbox')
      .first()
      .fill('{"replicas": 3, "image": "api:1.42", "env": "production"}')
    await page.mouse.move(1270, 790)
    await page.screenshot({ path: `${OUT}/json-${theme}.png` })
    await page.setViewportSize({ width: 1280, height: 480 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/json-short-${theme}.png` })
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1280, height: 800 })

    const epoch = await openTool(page, 'Epoch')
    await expect(epoch).toBeVisible()
    await page.mouse.move(1270, 790)
    await page.screenshot({ path: `${OUT}/epoch-${theme}.png` })
    await page.keyboard.press('Escape')

    await openSettings(page)
    await page.getByRole('dialog', { name: 'Settings' }).getByText('Email', { exact: true }).click()
    await page.mouse.move(1270, 790)
    await page.screenshot({ path: `${OUT}/settings-${theme}.png` })
  })
}
