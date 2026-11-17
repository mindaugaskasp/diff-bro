import { rmSync } from 'node:fs'
import {
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  openSettingsPage,
  closeSettings,
  openNewSnippet,
  docActions
} from './fixtures.mjs'

// Unique per run: parallel workers share the network, and each starts its own Ana and Ben.
const RUN = Math.random().toString(36).slice(2, 7)

export async function startPeer(base) {
  const name = `${base} ${RUN}${Math.random().toString(36).slice(2, 4)}`
  const dir = freshUserDataDir()
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)
  await page.evaluate((n) => window.api.lanUpdate({ name: n }), name)
  return { dir, app, page, name }
}

export async function addPeer(adder, holder) {
  const settings = await openSettingsPage(adder.page, 'Network')
  const row = settings.locator('.person', { hasText: holder.name })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.getByRole('button', { name: 'Add' }).click()
  const shown = holder.page.getByRole('dialog', { name: `${adder.name} wants to add you` })
  const code = (await shown.getByTestId('lan-code').innerText()).replace(/\W/g, '').slice(0, 6)
  const adding = adder.page.getByRole('dialog', { name: `Add ${holder.name}` })
  await adding.getByTestId('lan-code-input').fill(code)
  await adding.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(row.getByText('Trusted')).toBeVisible()
  const asked = holder.page.getByRole('dialog', { name: `${adder.name} added you` })
  const addedBack = holder.page.getByText(`${adder.name} added you back`)
  await expect(asked.or(addedBack)).toBeVisible()
  if (await asked.isVisible()) {
    await asked.locator('.dialog-actions').getByRole('button', { name: 'Not now' }).click()
  }
  await closeSettings(adder.page)
}

export async function pairBoth() {
  const ana = await startPeer('Ana')
  const ben = await startPeer('Ben')
  await addPeer(ben, ana)
  await addPeer(ana, ben)
  return { ana, ben }
}

export async function stop(...peers) {
  for (const peer of peers) {
    await peer.app.close()
    rmSync(peer.dir, { recursive: true, force: true })
  }
}

export async function saveSnippet(page, name, body) {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('Snippet name…').fill(name)
  await doc.locator('.editor').click()
  await page.keyboard.type(body)
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(doc).toBeHidden()
}

export async function shareDiff(page) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('before')
  await page.getByPlaceholder('Paste or type the changed text').fill('after')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const save = page.getByRole('dialog', { name: 'Share diff — step 1 of 2: save it' })
  await save.getByRole('button', { name: 'Next: choose recipient' }).click()
  return page.getByRole('dialog', { name: 'Share diff' })
}
