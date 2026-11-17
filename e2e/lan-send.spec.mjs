import { test, expect, snippetMoreMenu } from './fixtures.mjs'
import { pairBoth, saveSnippet, shareDiff, stop } from './lanPeers.mjs'

// Two launches and pairing both ways before the test proper starts.
test.describe.configure({ timeout: 90_000 })

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
    await band.getByRole('button', { name: 'Save snippet' }).click()
    const lanTag = ben.page.locator('.snippets-section').getByText('lan', { exact: true })
    await expect(lanTag).toBeVisible()
    await expect(
      ben.page.locator('.snippets-section').getByText(ana.name.toLowerCase(), { exact: true })
    ).toBeVisible()
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
    await ben.page.keyboard.press('Escape')
    await expect(ben.page.getByRole('menuitem', { name: '30 minutes' })).toBeHidden()
    await expect(offer).toBeVisible()
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
