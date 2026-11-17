import { test, expect, openSettingsPage } from './fixtures.mjs'
import { pairBoth, shareDiff, stop } from './lanPeers.mjs'

// Two launches and pairing both ways before the test proper starts.
test.describe.configure({ timeout: 90_000 })

async function send(from, to) {
  const dialog = await shareDiff(from.page)
  await dialog.locator('.recipient', { hasText: to.name }).getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Send now' }).click()
}

test('stopping sharing removes the key, deletes what waits, and tells them', async () => {
  const { ana, ben } = await pairBoth()
  try {
    await send(ana, ben)
    const offer = ben.page.getByRole('dialog', { name: `${ana.name} shared a diff` })
    await expect(offer).toBeVisible({ timeout: 10_000 })
    await offer.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(ben.page.getByTestId('lan-bell')).toContainText('1')

    const settings = await openSettingsPage(ben.page, 'Network')
    const anaRow = settings.locator('.person', { hasText: ana.name })
    await anaRow.getByRole('button', { name: 'Stop sharing' }).click()
    const confirm = ben.page.getByRole('dialog', { name: `Stop sharing with ${ana.name}?` })
    await expect(confirm.getByText('Their waiting item is deleted.')).toBeVisible()
    await confirm.getByRole('button', { name: 'Stop sharing' }).click()
    await expect(
      ben.page.getByText(`Stopped sharing with ${ana.name}. They’ve been told.`)
    ).toBeVisible()
    await expect(anaRow.getByRole('button', { name: 'Add' })).toBeVisible()
    await expect(ben.page.getByTestId('lan-bell')).toBeHidden()

    const told = ana.page.getByRole('dialog', { name: `${ben.name} stopped sharing with you` })
    await expect(told).toBeVisible({ timeout: 10_000 })
    await told.locator('.dialog-actions').getByRole('button', { name: 'OK' }).click()

    await send(ana, ben)
    await expect(ana.page.getByRole('dialog', { name: 'Couldn’t send' })).toBeVisible({
      timeout: 10_000
    })
  } finally {
    await stop(ana, ben)
  }
})
