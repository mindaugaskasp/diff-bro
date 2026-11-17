import { rmSync } from 'node:fs'
import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  openSettingsPage
} from './fixtures.mjs'

// Two instances on one machine share its network, which is all discovery needs. Other
// instances may be on the network too (the container's own app), so assertions name Ben.
const listeningServers = (app) =>
  app.evaluate(
    () =>
      process._getActiveHandles().filter((h) => h?.constructor?.name === 'Server' && h.listening)
        .length
  )

async function startPeer(name) {
  const dir = freshUserDataDir()
  const app = await launchApp(dir)
  const page = await firstReadyPage(app)
  await page.evaluate((n) => window.api.lanUpdate({ name: n }), name)
  return { dir, app, page }
}

test('instances on the same network find each other, and off closes the port', async () => {
  const ana = await startPeer('Ana')
  const ben = await startPeer('Ben')
  try {
    const settings = await openSettingsPage(ana.page, 'Network')
    const people = settings.getByTestId('lan-people')
    await expect(people).toContainText('Ben', { timeout: 20_000 })
    expect(await listeningServers(ben.app)).toBeGreaterThan(0)

    await ben.page.evaluate(() => window.api.lanUpdate({ enabled: false }))
    await expect(settings.getByText('Ben', { exact: true })).toHaveCount(0, { timeout: 20_000 })
    expect(await listeningServers(ben.app)).toBe(0)
  } finally {
    for (const peer of [ana, ben]) {
      await peer.app.close()
      rmSync(peer.dir, { recursive: true, force: true })
    }
  }
})

test('the Network page shows the name and the switches', async () => {
  const solo = await startPeer('Jonas’s MacBook Pro')
  try {
    const settings = await openSettingsPage(solo.page, 'Network')
    await expect(settings.getByTestId('lan-name')).toHaveValue('Jonas’s MacBook Pro')
    await expect(settings.getByRole('checkbox', { name: 'Share on this network' })).toBeChecked()
    await settings.getByRole('checkbox', { name: 'Share on this network' }).uncheck()
    await expect(settings.getByRole('checkbox', { name: 'Show me to others' })).toBeDisabled()
    await expect(settings.getByText('People on this network')).toHaveCount(0)
  } finally {
    await solo.app.close()
    rmSync(solo.dir, { recursive: true, force: true })
  }
})
