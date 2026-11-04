import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  test,
  expect,
  closeSettings,
  enablePython,
  PYTHON,
  stubMessageBox
} from './fixtures.mjs'
import { languageRow as row, openLanguages } from './runnerPrograms.mjs'

test.skip(!PYTHON, 'needs python3 on the machine')

const SPEEDUP = 1000

// Main's long timers run SPEEDUP times faster, so the real setTimeout path is what runs.
async function speedUpLongTimers(app) {
  await app.evaluate((_electron, speedup) => {
    const realSetTimeout = globalThis.setTimeout
    globalThis.longTimers = []
    globalThis.setTimeout = (fn, ms, ...rest) => {
      if (ms < 10_000) return realSetTimeout(fn, ms, ...rest)
      globalThis.longTimers.push(ms)
      return realSetTimeout(fn, ms / speedup, ...rest)
    }
  }, SPEEDUP)
}
const longTimers = (app) => app.evaluate(() => globalThis.longTimers)

async function setStopAfter(page, minutes) {
  const dialog = await openLanguages(page)
  const input = row(dialog, 'Python').getByRole('spinbutton', { name: /Stop after/ })
  await input.fill(String(minutes))
  await input.press('Tab')
  await expect(input).toHaveValue(String(minutes))
  await closeSettings(page)
  await expect(dialog).toBeHidden()
}

const startTicker = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        globalThis.runExit = null
        window.api.onRunExit((exit) => (globalThis.runExit = exit))
        window.api
          .runStart({
            key: 'spec',
            language: 'python',
            code: 'import time\nwhile True:\n    time.sleep(0.1)'
          })
          .then(resolve)
      })
  )
const runExit = (page) => page.evaluate(() => globalThis.runExit)

test.beforeEach(async ({ app, page }) => {
  await enablePython(app, page)
  await stubMessageBox(app, 1)
  await speedUpLongTimers(app)
})

test('a run stops after the minutes set for its language', async ({ app, page }) => {
  await setStopAfter(page, 1)
  const reply = await startTicker(page)
  expect(reply.stopAfterMinutes).toBe(1)
  await expect.poll(() => runExit(page)).toMatchObject({ reason: 'timeout' })
  expect(await longTimers(app)).toEqual([60_000])
})

test('0 minutes arms no timer, so a run outlives the old 30 s until Stop', async ({
  app,
  page
}) => {
  await setStopAfter(page, 0)
  const { runId, stopAfterMinutes } = await startTicker(page)
  expect(stopAfterMinutes).toBe(0)
  // 1.5 s here is 25 minutes on main's sped-up clock.
  await page.waitForTimeout(1500)
  expect(await runExit(page)).toBeNull()
  expect(await longTimers(app)).toEqual([])
  await page.evaluate((id) => window.api.runStop(id), runId)
  await expect.poll(() => runExit(page)).toMatchObject({ reason: 'stopped' })
})

test('the minutes are kept in runners.json, and main refuses anything but whole minutes', async ({
  app,
  page
}) => {
  await setStopAfter(page, 7)
  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
  const stored = JSON.parse(readFileSync(join(userData, 'runners.json'), 'utf8'))
  expect(stored.languages.python.stopAfterMinutes).toBe(7)
  for (const bad of [-1, 1.5, '3', null, 100_000]) {
    const reply = await page.evaluate((m) => window.api.runSetStopAfter('python', m), bad)
    expect(reply).toEqual({ error: 'bad-request' })
  }
  const status = await page.evaluate(() => window.api.runStatus())
  expect(status.python.stopAfterMinutes).toBe(7)
})
