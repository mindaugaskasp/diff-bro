import { rmSync } from 'node:fs'
import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  openSettingsPage,
  closeSettings,
  openNewSnippet,
  docActions,
  snippetMoreMenu
} from './fixtures.mjs'

// Two launches and pairing both ways before the test proper starts.
test.describe.configure({ timeout: 90_000 })

// Unique per run: parallel workers share the network, and each starts its own Ana and Ben.
const RUN = Math.random().toString(36).slice(2, 7)

async function startPeer(base) {
  const name = `${base} ${RUN}${Math.random().toString(36).slice(2, 4)}`
  const dir = freshUserDataDir()
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)
  await page.evaluate((n) => window.api.lanUpdate({ name: n }), name)
  return { dir, app, page, name }
}

async function add(adder, holder) {
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
  const back = holder.page.getByRole('dialog', { name: `${adder.name} added you` })
  await back.locator('.dialog-actions').getByRole('button', { name: 'Not now' }).click()
  await closeSettings(adder.page)
}

async function pairBoth() {
  const ana = await startPeer('Ana')
  const ben = await startPeer('Ben')
  await add(ben, ana)
  await add(ana, ben)
  return { ana, ben }
}

async function stop(...peers) {
  for (const peer of peers) {
    await peer.app.close()
    rmSync(peer.dir, { recursive: true, force: true })
  }
}

async function saveSnippet(page, name, body) {
  await openNewSnippet(page)
  const doc = page.getByRole('region', { name: 'New snippet' })
  await doc.getByPlaceholder('Snippet name…').fill(name)
  await doc.locator('.editor').click()
  await page.keyboard.type(body)
  await docActions(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(doc).toBeHidden()
}

async function shareDiff(page) {
  await page.getByRole('button', { name: 'Paste mode' }).click()
  await page.getByPlaceholder('Paste or type the original text').fill('before')
  await page.getByPlaceholder('Paste or type the changed text').fill('after')
  await page.getByRole('button', { name: 'Compare', exact: true }).click()
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const save = page.getByRole('dialog', { name: 'Share diff — step 1 of 2: save it' })
  await save.getByRole('button', { name: 'Next: choose recipient' }).click()
  return page.getByRole('dialog', { name: 'Share diff' })
}

test('a snippet sent on the network opens in a tab under the received band', async () => {
  const { ana, ben } = await pairBoth()
  try {
    await saveSnippet(ana.page, 'nginx reload', 'sudo nginx -t')
    await snippetMoreMenu(ana.page).click()
    await ana.page.getByRole('menuitem', { name: 'Share…' }).click()
    const dialog = ana.page.getByRole('dialog', { name: 'Share snippet' })
    const benRow = dialog.locator('.recipient', { hasText: ben.name })
    await expect(benRow.getByText('On your network')).toBeVisible()
    await benRow.getByRole('checkbox').check()
    await dialog.getByRole('button', { name: 'Send now' }).click()
    await expect(ana.page.getByText(`Sent to ${ben.name}`)).toBeVisible()

    const offer = ben.page.getByRole('dialog', { name: `${ana.name} shared a snippet` })
    await expect(offer).toBeVisible({ timeout: 10_000 })
    await expect(offer.getByText('nginx reload')).toBeVisible()
    await offer.getByRole('button', { name: 'Open' }).click()
    const band = ben.page.getByRole('region', { name: `From ${ana.name}` })
    await expect(band).toBeVisible()
    await expect(band.getByRole('button', { name: 'Save snippet' })).toBeVisible()
  } finally {
    await stop(ana, ben)
  }
})

test('X keeps a diff under the bell, and the bell opens it', async () => {
  const { ana, ben } = await pairBoth()
  try {
    const dialog = await shareDiff(ana.page)
    await dialog.locator('.recipient', { hasText: ben.name }).getByRole('checkbox').check()
    await dialog.getByRole('button', { name: 'Send now' }).click()

    const offer = ben.page.getByRole('dialog', { name: `${ana.name} shared a diff` })
    await expect(offer).toBeVisible({ timeout: 10_000 })
    await offer.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(offer).toBeHidden()
    const bell = ben.page.getByTestId('lan-bell')
    await expect(bell).toContainText('1')
    await bell.click()
    const card = ben.page.getByTestId('lan-card')
    await card.hover()
    await card.getByRole('button', { name: 'Open' }).click()
    await expect(ben.page.getByRole('region', { name: `From ${ana.name}` })).toBeVisible()
    await expect(bell).toBeHidden()
  } finally {
    await stop(ana, ben)
  }
})

test('silencing keeps the next item from popping up', async () => {
  const { ana, ben } = await pairBoth()
  try {
    const first = await shareDiff(ana.page)
    await first.locator('.recipient', { hasText: ben.name }).getByRole('checkbox').check()
    await first.getByRole('button', { name: 'Send now' }).click()
    const offer = ben.page.getByRole('dialog', { name: `${ana.name} shared a diff` })
    await expect(offer).toBeVisible({ timeout: 10_000 })
    await offer.getByRole('button', { name: /1 hour/ }).click()
    await ben.page.getByRole('menuitem', { name: '30 minutes' }).click()
    await expect(offer).toBeHidden()
    await expect(ben.page.getByText('Popups silenced for 30 minutes')).toBeVisible()

    const bell = ben.page.getByTestId('lan-bell')
    await expect(bell).toContainText('1')
    const second = await shareDiff(ana.page)
    await second.locator('.recipient', { hasText: ben.name }).getByRole('checkbox').check()
    await second.getByRole('button', { name: 'Send now' }).click()
    await expect(bell).toContainText('2', { timeout: 10_000 })
    await expect(offer).toBeHidden()
  } finally {
    await stop(ana, ben)
  }
})

test('a picked person who leaves the network is unticked and disabled', async () => {
  const { ana, ben } = await pairBoth()
  try {
    const dialog = await shareDiff(ana.page)
    const benRow = dialog.locator('.recipient', { hasText: ben.name })
    await benRow.getByRole('checkbox').check()
    await ben.page.evaluate(() => window.api.lanUpdate({ enabled: false }))
    await expect(benRow.getByText('Not on this network')).toBeVisible({ timeout: 20_000 })
    await expect(benRow.getByRole('checkbox')).toBeDisabled()
    await expect(benRow.getByRole('checkbox')).not.toBeChecked()
    await expect(dialog.getByText('No one picked is on your network now.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Send now' })).toBeDisabled()
  } finally {
    await stop(ana, ben)
  }
})
