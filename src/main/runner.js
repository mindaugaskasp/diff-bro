// Electron glue over runnerCore.js: runs a snippet with the program main holds for its language.
import { app, dialog, ipcMain } from 'electron'
import { readConfig, timeoutMsOf, writeConfig } from './runnerConfig'
import { createRuns, refusalFor } from './runnerRuns'
import { configFile, registerRunnerSettingsIpc, windowOf } from './runnerSettings'
import { readSnippetStore } from './appData'
import { parseStore } from './storeEntries'
import { t } from './i18n'

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
  const settings = config.languages[language]
  stopRunsWhenGone(sender)
  const runId = runs.begin({
    owner: sender.id,
    key,
    exe: settings.path,
    language,
    code,
    limits: { timeoutMs: timeoutMsOf(settings) },
    onOutput: (chunk) => sendIfAlive(sender, 'run:output', { key, runId, ...chunk }),
    onExit: (exit) => sendIfAlive(sender, 'run:exit', { key, runId, ...exit })
  })
  return { runId, version: settings.version, stopAfterMinutes: settings.stopAfterMinutes }
}

export function registerRunnerIpc() {
  app.on('will-quit', runs.stopAll)
  ipcMain.handle('run:start', start)
  ipcMain.handle('run:stop', (e, runId) => runs.stopIfOwner(runId, e.sender.id))
  registerRunnerSettingsIpc()
}
