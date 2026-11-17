import { test, expect, openSettingsPage } from './fixtures.mjs'
import { startPeer, stop } from './lanPeers.mjs'

// Other instances may share the network (the container's own app), so assertions name the peer.
const listeningServers = (app) =>
  app.evaluate(
    () =>
      process._getActiveHandles().filter((h) => h?.constructor?.name === 'Server' && h.listening)
        .length
  )

test('instances on the same network find each other, and off closes the port', async () => {
  const ana = await startPeer('Ana')
  const ben = await startPeer('Ben')
  try {
    const settings = await openSettingsPage(ana.page, 'Network')
    const people = settings.getByTestId('lan-people')
    await expect(people).toContainText(ben.name, { timeout: 20_000 })
    expect(await listeningServers(ben.app)).toBeGreaterThan(0)

    await ben.page.evaluate(() => window.api.lanUpdate({ enabled: false }))
    await expect(settings.getByText(ben.name, { exact: true })).toHaveCount(0, { timeout: 20_000 })
    expect(await listeningServers(ben.app)).toBe(0)
  } finally {
    await stop(ana, ben)
  }
})

test('the Network page shows the name and the switches', async () => {
  const solo = await startPeer('Jonas’s MacBook Pro')
  try {
    const settings = await openSettingsPage(solo.page, 'Network')
    await expect(settings.getByTestId('lan-name')).toHaveValue(solo.name)
    await expect(settings.getByRole('checkbox', { name: 'Share on this network' })).toBeChecked()
    await settings.getByRole('checkbox', { name: 'Share on this network' }).uncheck()
    await expect(settings.getByRole('checkbox', { name: 'Show me to others' })).toBeDisabled()
    await expect(settings.getByText('People on this network')).toHaveCount(0)
  } finally {
    await stop(solo)
  }
})
