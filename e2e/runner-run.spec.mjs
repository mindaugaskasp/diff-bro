import { execSync } from 'node:child_process'
import { test, expect, markSecret, showPanel, stubMessageBox, stubOpenDialog } from './fixtures.mjs'

const PYTHON = execSync('command -v python3', { shell: '/bin/sh' }).toString().trim()

async function enablePython(app, page) {
  await stubMessageBox(app, 1)
  await stubOpenDialog(app, PYTHON)
  const reply = await page.evaluate(() => window.api.runEnable('python'))
  expect(reply.status.python.enabled).toBe(true)
}

// Collects a run through window.api, the way the pane will.
const runPython = (page, code, snippetId = null) =>
  page.evaluate(
    ({ code, snippetId }) =>
      new Promise((resolve) => {
        const chunks = []
        window.api.onRunOutput((chunk) => chunks.push(chunk))
        window.api.onRunExit((exit) => resolve({ chunks, exit }))
        window.api.runStart({ key: 'spec', language: 'python', code, snippetId }).then((reply) => {
          if (!reply.runId) resolve({ reply })
        })
      }),
    { code, snippetId }
  )

test('a run streams its output and reports how it ended', async ({ app, page }) => {
  await enablePython(app, page)
  const { chunks, exit } = await runPython(page, 'import sys\nprint("hi")\nsys.exit(3)')
  expect(chunks.map((c) => c.text).join('')).toBe('hi\n')
  expect(exit).toMatchObject({ key: 'spec', reason: 'exit', code: 3 })
})

test('stderr comes through as its own stream', async ({ app, page }) => {
  await enablePython(app, page)
  const { chunks } = await runPython(page, 'raise ValueError("nope")')
  const err = chunks.filter((c) => c.stream === 'err').map((c) => c.text)
  expect(err.join('')).toContain('ValueError: nope')
})

test('the warning shows on the first run ever, and never again', async ({ app, page }) => {
  await enablePython(app, page)
  await app.evaluate(({ dialog }) => {
    globalThis.asked = []
    dialog.showMessageBox = async (_win, options) => {
      globalThis.asked.push(options.detail)
      return { response: 1 }
    }
  })
  await runPython(page, 'print(1)')
  await runPython(page, 'print(2)')
  const asked = await app.evaluate(() => globalThis.asked)
  expect(asked).toHaveLength(1)
  expect(asked[0]).toContain('takes no responsibility')
})

test('cancelling the warning runs nothing, and it asks again next time', async ({ app, page }) => {
  await enablePython(app, page)
  await stubMessageBox(app, 0)
  const { reply } = await runPython(page, 'print(1)')
  expect(reply.cancelled).toBe(true)
  await stubMessageBox(app, 1)
  const { chunks } = await runPython(page, 'print(2)')
  expect(chunks.map((c) => c.text).join('')).toBe('2\n')
})

test('a language that is off refuses', async ({ page }) => {
  const { reply } = await runPython(page, 'print(1)')
  expect(reply.error).toBe('not-enabled')
})

test('a secret snippet refuses', async ({ app, page }) => {
  await enablePython(app, page)
  await showPanel(page, 'snippets')
  await markSecret(page, 'Example — Mermaid diagram')
  await expect
    .poll(() => page.evaluate(() => window.api.storeLoad('snippets')))
    .toContain('"secret":true')
  const id = await page.evaluate(() => {
    const { entries } = JSON.parse(window.api.storeLoad('snippets'))
    return entries.find((e) => e.secret).id
  })
  const { reply } = await runPython(page, 'print(1)', id)
  expect(reply.error).toBe('secret')
})

test('a run can be stopped', async ({ app, page }) => {
  await enablePython(app, page)
  await stubMessageBox(app, 1)
  const exit = await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.api.onRunExit(resolve)
        window.api
          .runStart({ key: 'spec', language: 'python', code: 'import time\ntime.sleep(60)' })
          .then(({ runId }) => setTimeout(() => window.api.runStop(runId), 200))
      })
  )
  expect(exit.reason).toBe('stopped')
})
