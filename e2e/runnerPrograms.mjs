import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSettingsPage } from './fixtures.mjs'

// A shell script that answers --version, and leaves a mark once it has been run.
export function fakeProgram(answer) {
  const dir = mkdtempSync(join(tmpdir(), 'runner-fake-'))
  const file = join(dir, 'interpreter')
  const mark = join(dir, 'was-run')
  writeFileSync(file, `#!/bin/sh\ntouch "${mark}"\necho "${answer}"\n`)
  chmodSync(file, 0o755)
  return { dir, file, wasRun: () => existsSync(mark) }
}

export function rememberProgram(userDataDir, languages) {
  writeFileSync(join(userDataDir, 'runners.json'), JSON.stringify({ languages }))
}

export const openLanguages = (page) => openSettingsPage(page, 'Languages')

export const languageRow = (dialog, name) => dialog.locator('.lang-row', { hasText: name })

// Answers every confirm with `response`, and keeps what each one said.
export async function recordMessageBoxes(app, response) {
  await app.evaluate(({ dialog }, r) => {
    globalThis.messageBoxes = []
    dialog.showMessageBox = async (_win, options) => {
      globalThis.messageBoxes.push(options)
      return { response: r }
    }
  }, response)
}
export const messageBoxes = (app) => app.evaluate(() => globalThis.messageBoxes)

export async function failOpenDialog(app) {
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => {
      throw new Error('the open dialog was not expected')
    }
  })
}
