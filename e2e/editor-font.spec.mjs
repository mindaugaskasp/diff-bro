import { rmSync } from 'node:fs'
import {
  test,
  expect,
  firstReadyPage,
  freshUserDataDir,
  launchApp,
  openSettings,
  showPanel,
  saveSettings
} from './fixtures.mjs'

const family = (locator) => locator.evaluate((el) => getComputedStyle(el).fontFamily)

async function pickFirstInstalledFont(page) {
  await openSettings(page)
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  const select = dialog.getByLabel('Editor font')
  const options = await select.locator('option').evaluateAll((os) => os.map((o) => o.value))
  const chosen = options.find((v) => v)
  expect(chosen, 'at least one installed monospace font').toBeTruthy()
  await select.selectOption(chosen)
  await expect(dialog.locator('.font-preview')).toHaveCSS('font-family', new RegExp(chosen))
  await saveSettings(page)
  return chosen
}

async function snippetLines(page) {
  await showPanel(page, 'snippets')
  await page.locator('li.row', { hasText: 'Example — Claude review' }).click()
  const lines = page.locator('.snippet-doc:visible .editor .view-lines').first()
  await expect(lines).toBeVisible()
  return lines
}

test('the editor font chosen in Settings reaches the snippet editor', async ({ page }) => {
  const chosen = await pickFirstInstalledFont(page)
  const lines = await snippetLines(page)
  await expect.poll(() => family(lines)).toContain(chosen)
})

test('the editor font survives a relaunch', async () => {
  const dir = freshUserDataDir()
  try {
    const first = await launchApp(dir)
    const chosen = await pickFirstInstalledFont(await firstReadyPage(first))
    await first.close()

    const second = await launchApp(dir)
    const lines = await snippetLines(await firstReadyPage(second))
    await expect.poll(() => family(lines)).toContain(chosen)
    await second.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
