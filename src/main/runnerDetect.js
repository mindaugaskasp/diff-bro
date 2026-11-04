// Finds installed interpreters without a shell: PATH plus fixed folders, read with fs.
import { posix, win32 } from 'node:path'

const pathsFor = (platform) => (platform === 'win32' ? win32 : posix)

const PROGRAM_NAMES = {
  posix: { php: ['php'], python: ['python3'], curl: ['curl'] },
  win32: { php: ['php.exe'], python: ['python.exe', 'py.exe'], curl: ['curl.exe'] }
}

// A Dock launch on macOS gets a PATH without Homebrew, so its folders are listed outright.
function darwinDirs(language, { home }) {
  const shared = ['/opt/homebrew/bin', '/usr/local/bin']
  if (language === 'curl') {
    return ['/opt/homebrew/opt/curl/bin', '/usr/local/opt/curl/bin', ...shared, '/usr/bin']
  }
  if (language === 'php') {
    return [...shared, `${home}/.phpenv/shims`, `${home}/Library/Application Support/Herd/bin`]
  }
  return [
    ...shared,
    `${home}/.pyenv/shims`,
    '/Library/Frameworks/Python.framework/Versions/*/bin',
    '/usr/bin'
  ]
}

function linuxDirs(language, { home }) {
  const shared = ['/usr/bin', '/usr/local/bin']
  if (language !== 'python') return shared
  return [...shared, `${home}/.pyenv/shims`, `${home}/.local/bin`]
}

function windowsDirs(language, { home, env }) {
  const scoop = win32.join(home, 'scoop', 'shims')
  const choco = win32.join(env.ProgramData ?? 'C:\\ProgramData', 'chocolatey', 'bin')
  if (language === 'curl') {
    return [win32.join(env.SystemRoot ?? 'C:\\Windows', 'System32'), scoop, choco]
  }
  if (language === 'php') {
    return ['C:\\php', 'C:\\xampp\\php', 'C:\\laragon\\bin\\php\\*', scoop, choco]
  }
  const local = env.LOCALAPPDATA ?? win32.join(home, 'AppData', 'Local')
  return [
    win32.join(local, 'Programs', 'Python', 'Python3*'),
    win32.join(env.ProgramFiles ?? 'C:\\Program Files', 'Python3*'),
    win32.join(local, 'Programs', 'Python', 'Launcher'),
    env.SystemRoot ?? 'C:\\Windows',
    scoop,
    choco
  ]
}

const FIXED_DIRS = { darwin: darwinDirs, linux: linuxDirs, win32: windowsDirs }

export function searchDirs({ language, platform, env, home }) {
  const fromPath = (env.PATH ?? env.Path ?? '').split(pathsFor(platform).delimiter)
  const fixed = (FIXED_DIRS[platform] ?? linuxDirs)(language, { home, env })
  return [...fromPath, ...fixed].filter((dir) => pathsFor(platform).isAbsolute(dir))
}

// One `*` segment at most, matched as a prefix: `Python3*`, `Versions/*`.
function expandDir(dir, { platform, readdir }) {
  const paths = pathsFor(platform)
  const segments = dir.split(paths.sep)
  const at = segments.findIndex((segment) => segment.endsWith('*'))
  if (at === -1) return [dir]
  const parent = segments.slice(0, at).join(paths.sep) || paths.sep
  const prefix = segments[at].slice(0, -1)
  const rest = segments.slice(at + 1)
  return readdir(parent)
    .filter((name) => name.startsWith(prefix))
    .sort()
    .map((name) => paths.join(parent, name, ...rest))
}

export function candidatePaths({ language, platform, env, home, readdir }) {
  const paths = pathsFor(platform)
  const names = PROGRAM_NAMES[platform === 'win32' ? 'win32' : 'posix'][language]
  const dirs = searchDirs({ language, platform, env, home }).flatMap((dir) =>
    expandDir(dir, { platform, readdir })
  )
  return [...new Set(dirs.flatMap((dir) => names.map((name) => paths.join(dir, name))))]
}

const COMMAND_LINE_TOOLS = [
  '/Library/Developer/CommandLineTools/usr/bin/python3',
  '/Applications/Xcode.app/Contents/Developer/usr/bin/python3'
]
export const hasCommandLineTools = (fs) => COMMAND_LINE_TOOLS.some((path) => fs.isProgramFile(path))

// Running either opens an installer: the Microsoft Store, or Apple's tools prompt.
export function isTrap(path, { platform, fs }) {
  if (platform === 'win32') return /[\\/]WindowsApps[\\/]/i.test(path)
  return platform === 'darwin' && path === '/usr/bin/python3' && !hasCommandLineTools(fs)
}

function versionParts(version) {
  return version.split('.').map(Number)
}

export function newestFirst(found) {
  const compare = (a, b) => {
    const [left, right] = [versionParts(a.version), versionParts(b.version)]
    const differs = left.findIndex((part, i) => part !== right[i])
    return differs === -1 ? 0 : right[differs] - left[differs]
  }
  return [...found].sort(compare)
}

// The same file reached twice (a symlink, a merged /bin) is listed once, under the first path seen.
function oncePerFile(paths, fs) {
  const seen = new Set()
  return paths.filter((path) => {
    const real = fs.realpath(path)
    if (seen.has(real)) return false
    seen.add(real)
    return true
  })
}

/**
 * @param {object} o
 * @param {string} o.language
 * @param {string} o.platform
 * @param {Record<string, string|undefined>} o.env
 * @param {string} o.home
 * @param {{ readdir: (dir: string) => string[], isProgramFile: (path: string) => boolean, realpath: (path: string) => string }} o.fs
 * @param {(o: { exe: string, language: string }) => Promise<string|null>} o.readVersion
 * @returns {Promise<{ path: string, version: string }[]>} newest first
 */
export async function detectPrograms({ language, platform, env, home, fs, readVersion }) {
  const present = candidatePaths({ language, platform, env, home, readdir: fs.readdir }).filter(
    (path) => fs.isProgramFile(path) && !isTrap(path, { platform, fs })
  )
  const probed = await Promise.all(
    oncePerFile(present, fs).map(async (path) => ({
      path,
      version: await readVersion({ exe: path, language })
    }))
  )
  return newestFirst(probed.filter((found) => found.version))
}
