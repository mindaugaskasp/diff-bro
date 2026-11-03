// Electron glue for choosing a language's program. The renderer names a program
// only as an index into what main found, or as a typed path main checks and confirms.
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isEnabled, readConfig, rendererStatus, withLanguage, writeConfig } from './runnerConfig'
import { isRunnableLanguage, readVersion } from './runnerCore'
import { detectPrograms, isTrap } from './runnerDetect'
import { programForEnable, programFs, typedPathRefusal } from './runnerProgram'
import { labelKeyOf } from '../shared/snippetLanguages'
import { t } from './i18n'

export const configFile = () => join(app.getPath('userData'), 'runners.json')
export const windowOf = (e) => BrowserWindow.fromWebContents(e.sender)
const nameOf = (language) => t(labelKeyOf(language))

const found = {}
const statusReply = (config) => ({ ok: true, status: rendererStatus(config, found) })
export const currentStatus = () => rendererStatus(readConfig(configFile()), found)

async function detectAndKeep(language) {
  found[language] = await detectPrograms({
    language,
    platform: process.platform,
    env: process.env,
    home: homedir(),
    fs: programFs,
    readVersion
  })
  return found[language]
}

async function confirmBox(win, { message, detail, button }) {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    message,
    detail,
    buttons: [t('common.cancel'), button],
    defaultId: 1,
    cancelId: 0
  })
  return response === 1
}

const confirmEnable = (win, language) =>
  confirmBox(win, {
    message: t('runner.enableTitle', { language: nameOf(language) }),
    detail: t('runner.enableDetail', { language: nameOf(language) }),
    button: t('runner.continue')
  })

const confirmTypedPath = (win, language, path) =>
  confirmBox(win, {
    message: t('runner.useTitle', { language: nameOf(language) }),
    detail: t('runner.useDetail', { path }),
    button: t('runner.use')
  })

async function pickProgram(win, language) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: t('runner.pickTitle', { language: nameOf(language) }),
    properties: ['openFile']
  })
  return canceled ? null : (filePaths[0] ?? null)
}

// Refuses a program whose --version is not this language. Only enable turns a language on.
async function adoptProgram(language, path, { turnOn = false } = {}) {
  if (!path) return { canceled: true }
  const version = await readVersion({ exe: path, language })
  if (!version) return { error: 'not-that-language' }
  const config = withLanguage(readConfig(configFile()), language, {
    ...(turnOn ? { enabled: true } : {}),
    path,
    version
  })
  writeConfig(configFile(), config)
  return statusReply(config)
}

async function enable(e, language) {
  if (!isRunnableLanguage(language)) return { error: 'bad-request' }
  const win = windowOf(e)
  if (!(await confirmEnable(win, language))) return { canceled: true }
  const { path, notice } = await programForEnable({
    known: readConfig(configFile()).languages[language].path,
    fs: programFs,
    detect: () => detectAndKeep(language),
    pick: () => pickProgram(win, language)
  })
  const reply = await adoptProgram(language, path, { turnOn: true })
  return reply.ok && notice ? { ...reply, notice } : reply
}

async function browse(e, language) {
  if (!isRunnableLanguage(language)) return { error: 'bad-request' }
  return adoptProgram(language, await pickProgram(windowOf(e), language))
}

function choose(_e, language, index) {
  if (!isRunnableLanguage(language)) return { error: 'bad-request' }
  const candidate = Number.isInteger(index) ? found[language]?.[index] : undefined
  if (!candidate) return { error: 'bad-request' }
  return adoptProgram(language, candidate.path)
}

async function usePath(e, language, path) {
  if (!isRunnableLanguage(language)) return { error: 'bad-request' }
  const platform = process.platform
  const refusal = typedPathRefusal(path, {
    platform,
    fs: programFs,
    isTrap: (candidate) => isTrap(candidate, { platform, fs: programFs })
  })
  if (refusal) return { error: refusal }
  if (!(await confirmTypedPath(windowOf(e), language, path))) return { canceled: true }
  return adoptProgram(language, path)
}

// Only once enabling was confirmed: every candidate found is run with --version.
async function findAgain(_e, language) {
  if (!isRunnableLanguage(language)) return { error: 'bad-request' }
  const config = readConfig(configFile())
  if (!isEnabled(config, language)) return { error: 'not-enabled' }
  const programs = await detectAndKeep(language)
  return { ...statusReply(config), ...(programs.length ? {} : { error: 'none-found' }) }
}

function disable(_e, language) {
  if (!isRunnableLanguage(language)) return { error: 'bad-request' }
  const config = withLanguage(readConfig(configFile()), language, { enabled: false })
  writeConfig(configFile(), config)
  return statusReply(config)
}

export function registerRunnerSettingsIpc() {
  ipcMain.handle('run:status', currentStatus)
  ipcMain.handle('run:enable', enable)
  ipcMain.handle('run:change', browse)
  ipcMain.handle('run:choose', choose)
  ipcMain.handle('run:usePath', usePath)
  ipcMain.handle('run:findAgain', findAgain)
  ipcMain.handle('run:disable', disable)
}
