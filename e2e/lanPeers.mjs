import { rmSync } from 'node:fs'
import { launchApp, freshUserDataDir, firstReadyPage } from './fixtures.mjs'

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

export async function stop(...peers) {
  for (const peer of peers) {
    await peer.app.close()
    rmSync(peer.dir, { recursive: true, force: true })
  }
}
