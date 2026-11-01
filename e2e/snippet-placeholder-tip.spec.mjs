import { rmSync } from 'node:fs'
import {
  test,
  expect,
  firstReadyPage,
  freshUserDataDir,
  launchApp,
  newSnippetButton,
  showPanel
} from './fixtures.mjs'

const TIP = 'Did you know you can use {{placeholderValue}} to replace text when copying a snippet!'

async function newSnippet(page) {
  await showPanel(page, 'snippets')
  await newSnippetButton(page).click()
  return page.getByRole('region', { name: 'New snippet' })
}

test('a new snippet teaches placeholders until told not to, across a relaunch', async () => {
  const dir = freshUserDataDir()
  let app = await launchApp(dir)
  try {
    let page = await firstReadyPage(app)
    let doc = await newSnippet(page)
    await expect(doc.locator('.placeholder-tip')).toContainText(TIP)
    await doc.getByRole('button', { name: "Don't show this again" }).click()
    await expect(doc.locator('.placeholder-tip')).toHaveCount(0)
    await app.close()

    app = await launchApp(dir)
    page = await firstReadyPage(app)
    doc = await newSnippet(page)
    await expect(doc).toBeVisible()
    await expect(doc.locator('.placeholder-tip')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a saved snippet does not show the tip', async ({ page }) => {
  await showPanel(page, 'snippets')
  await page.locator('li.row', { hasText: 'Example — Claude review' }).first().click()
  await expect(page.locator('.snippet-doc:visible')).toBeVisible()
  await expect(page.locator('.placeholder-tip')).toHaveCount(0)
})
