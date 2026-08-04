// Guards the isolation parallel workers rest on. Without it, dropping the env
// from `launchApp` does not fail here — it makes the 22 clipboard specs read
// each other's copies and the staged-file specs lose their file to a
// neighbour's launch sweep, intermittently and somewhere else entirely.
//
// app.getPath('temp') is the one the product reads: clipboardStage.js both
// stages into it and sweeps every diffbro-clipboard-* out of it on launch.
import { test, expect } from './fixtures.mjs'
import { displayFor, workerIndex } from './workerEnv.mjs'

test('the app runs on this worker own display, temp dir and home', async ({ app }) => {
  const seen = await app.evaluate(({ app: electronApp }) => ({
    display: process.env.DISPLAY,
    temp: electronApp.getPath('temp'),
    home: process.env.HOME
  }))

  expect(seen.display).toBe(displayFor())
  expect(seen.temp).toContain(`diffbro-w${workerIndex()}-tmp`)
  expect(seen.home).toContain(`diffbro-w${workerIndex()}-home`)
})
