// Dropping the env from `launchApp` fails nowhere near itself: the clipboard
// specs start reading each other's copies, intermittently and elsewhere.
import { test, expect } from './fixtures.mjs'
import { displayFor, isX11, workerIndex } from './workerEnv.mjs'

const launchedEnv = (app) =>
  app.evaluate(({ app: electronApp }) => ({
    display: process.env.DISPLAY,
    temp: electronApp.getPath('temp'),
    home: process.env.HOME
  }))

test('the app runs against this worker own temp dir and home', async ({ app }) => {
  const seen = await launchedEnv(app)
  expect(seen.temp).toContain(`diffbro-w${workerIndex()}-tmp`)
  expect(seen.home).toContain(`diffbro-w${workerIndex()}-home`)
})

// X11 only: macOS and Windows have one system clipboard and no per-worker
// display, which workerEnv refuses to pretend otherwise about.
test('the app runs on this worker own display', async ({ app }) => {
  test.skip(!isX11, 'DISPLAY is X11-only')
  expect((await launchedEnv(app)).display).toBe(displayFor())
})
