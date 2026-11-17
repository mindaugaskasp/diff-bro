import { rmSync } from 'node:fs'
import {
  test,
  expect,
  launchApp,
  freshUserDataDir,
  firstReadyPage,
  openSettingsPage
} from './fixtures.mjs'

// Other instances may share the network (the container's own app), so assertions name the peer.
const listeningServers = (app) =>
  app.evaluate(
    () =>
      process._getActiveHandles().filter((h) => h?.constructor?.name === 'Server' && h.listening)
        .length
  )

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
    await expect(settings.getByTestId('lan-name')).toHaveValue(solo.name)
    await expect(settings.getByRole('checkbox', { name: 'Share on this network' })).toBeChecked()
    await settings.getByRole('checkbox', { name: 'Share on this network' }).uncheck()
    await expect(settings.getByRole('checkbox', { name: 'Show me to others' })).toBeDisabled()
    await expect(settings.getByText('People on this network')).toHaveCount(0)
  } finally {
    await solo.app.close()
    rmSync(solo.dir, { recursive: true, force: true })
  }
})
