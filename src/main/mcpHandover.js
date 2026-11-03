// macOS routes a Dock/Spotlight/Finder launch to ANY running process of the
// bundle, the window-less MCP server included, so it must pass the launch on.
import { batchOpenFiles } from './openFileBatch'

const OPEN = '/usr/bin/open'
const OPEN_FILE_BATCH_MS = 150

/**
 * @param {string} execPath
 * @returns {string|null}
 */
export function bundlePathOf(execPath) {
  const match = /\.app\/Contents\/MacOS\/[^/]+$/.exec(execPath)
  return match ? execPath.slice(0, match.index + '.app'.length) : null
}

/**
 * @param {{ app: import('electron').App, execPath: string,
 *   launch: (file: string, args: string[]) => void }} deps
 */
export function forwardLaunchesToGui({ app, execPath, launch }) {
  const bundle = bundlePathOf(execPath)
  if (!bundle) return
  const handOver = (files) => {
    launch(OPEN, ['-n', '-a', bundle, ...(files.length ? ['--args', ...files] : [])])
    app.dock?.hide()
  }
  const queueFile = batchOpenFiles(handOver, OPEN_FILE_BATCH_MS)
  app.on('activate', () => handOver([]))
  app.on('open-file', (event, path) => {
    event.preventDefault()
    queueFile(path)
  })
}
