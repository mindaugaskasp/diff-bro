// Electron glue over runnerCore.js and runnerConfig.js. The renderer names a
// language only: the program is picked here, in main's own dialogs.
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { isEnabled, readConfig, rendererStatus, withLanguage, writeConfig } from './runnerConfig'
import { isRunnableLanguage, readVersion } from './runnerCore'
import { createRuns, refusalFor } from './runnerRuns'
import { readSnippetStore } from './appData'
import { parseStore } from './storeEntries'
import { labelKeyOf } from '../shared/snippetLanguages'
import { t } from './i18n'

const configFile = () => join(app.getPath('userData'), 'runners.json')
const windowOf = (e) => BrowserWindow.fromWebContents(e.sender)
const statusReply = (config) => ({ ok: true, status: rendererStatus(config) })
const nameOf = (language) => t(labelKeyOf(language))

async function confirmEnable(win, language) {
  const name = nameOf(language)
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    message: t('runner.enableTitle', { language: name }),
    detail: t('runner.enableDetail', { language: name }),
    buttons: [t('common.cancel'), t('runner.continue')],
    defaultId: 1,
    cancelId: 0
  })
  return response === 1
}

async function pickProgram(win, language) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: t('runner.pickTitle', { language: nameOf(language) }),
    properties: ['openFile']
  })
  return canceled ? null : (filePaths[0] ?? null)
}

// Refuses a program whose --version is not this language.
async function adoptProgram(language, path) {
  const version = await readVersion({ exe: path, language })
  if (!version) return { error: 'not-that-language' }
  const config = withLanguage(readConfig(configFile()), language, {
    enabled: true,
    path,
    version
  })
  writeConfig(configFile(), config)
  return statusReply(config)
}

const adoptPicked = (language, path) => (path ? adoptProgram(language, path) : { canceled: true })

async function enable(e, language) {
  if (!isRunnableLanguage(language)) return { error: 'bad-request' }
  const win = windowOf(e)
  if (!(await confirmEnable(win, language))) return { canceled: true }
  const known = readConfig(configFile()).languages[language].path
  return adoptPicked(language, known ?? (await pickProgram(win, language)))
}

// Only swaps the program of a language already on: turning one on goes through enable's warning.
async function change(e, language) {
  if (!isRunnableLanguage(language)) return { error: 'bad-request' }
  if (!isEnabled(readConfig(configFile()), language)) return { error: 'not-enabled' }
  return adoptPicked(language, await pickProgram(windowOf(e), language))
}

function disable(_e, language) {
  if (!isRunnableLanguage(language)) return { error: 'bad-request' }
  const config = withLanguage(readConfig(configFile()), language, { enabled: false })
  writeConfig(configFile(), config)
  return statusReply(config)
}

const runs = createRuns()

const readSnippets = () => parseStore(readSnippetStore())

// Once ever, in main, so code in the window can neither skip it nor answer it.
async function confirmFirstRun(win, config) {
  if (config.confirmed) return true
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    message: t('runner.confirmTitle'),
    detail: t('runner.confirmDetail'),
    buttons: [t('common.cancel'), t('runner.run')],
    defaultId: 1,
    cancelId: 0
  })
  if (response !== 1) return false
  writeConfig(configFile(), { ...readConfig(configFile()), confirmed: true })
  return true
}

function sendIfAlive(sender, channel, payload) {
  if (!sender.isDestroyed()) sender.send(channel, payload)
}

function vetRequest(request) {
  const config = readConfig(configFile())
  return { config, refusal: refusalFor({ ...request, config, store: readSnippets() }) }
}

const watchedSenders = new WeakSet()
function stopRunsWhenGone(sender) {
  if (watchedSenders.has(sender)) return
  watchedSenders.add(sender)
  sender.once('destroyed', () => runs.stopOwnedBy(sender.id))
}

async function start(e, { key, language, code, snippetId } = {}) {
  const request = { language, code, snippetId }
  const before = vetRequest(request)
  if (before.refusal) return { error: before.refusal }
  if (!(await confirmFirstRun(windowOf(e), before.config))) return { canceled: true }
  // Read again after the dialog: the language may have been turned off meanwhile.
  const { config, refusal } = vetRequest(request)
  if (refusal) return { error: refusal }

  const { sender } = e
  const { path, version } = config.languages[language]
  stopRunsWhenGone(sender)
  const runId = runs.begin({
    owner: sender.id,
    key,
    exe: path,
    language,
    code,
    onOutput: (chunk) => sendIfAlive(sender, 'run:output', { key, runId, ...chunk }),
    onExit: (exit) => sendIfAlive(sender, 'run:exit', { key, runId, ...exit })
  })
  return { runId, version }
}

export function registerRunnerIpc() {
  app.on('will-quit', runs.stopAll)
  ipcMain.handle('run:start', start)
  ipcMain.handle('run:stop', (e, runId) => runs.stopIfOwner(runId, e.sender.id))
  ipcMain.handle('run:status', () => rendererStatus(readConfig(configFile())))
  ipcMain.handle('run:enable', enable)
  ipcMain.handle('run:change', change)
  ipcMain.handle('run:disable', disable)
}
