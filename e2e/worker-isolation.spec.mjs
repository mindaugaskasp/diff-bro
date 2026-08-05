// Dropping the env from `launchApp` fails nowhere near itself: the clipboard
// specs start reading each other's copies, intermittently and elsewhere.
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, launchApp, freshUserDataDir } from './fixtures.mjs'
import { displayFor, isX11 } from './workerEnv.mjs'

const launchedEnv = (app) =>
  app.evaluate(({ app: electronApp }) => ({
    display: process.env.DISPLAY,
    temp: electronApp.getPath('temp'),
    home: process.env.HOME
  }))

// Its own profile, so the paths can be asserted exactly rather than by shape.
test('the app scratch dirs are its own profile, not the worker', async () => {
  const dir = freshUserDataDir()
  const app = await launchApp(dir)
  try {
    const seen = await launchedEnv(app)
    expect(seen.temp).toBe(join(dir, 'tmp'))
    expect(seen.home).toBe(join(dir, 'home'))
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

// X11 only: macOS and Windows have one system clipboard and no per-worker
// display, which workerEnv refuses to pretend otherwise about.
test('the app runs on this worker own display', async ({ app }) => {
  test.skip(!isX11, 'DISPLAY is X11-only')
  expect((await launchedEnv(app)).display).toBe(displayFor())
})
