import { describe, expect, it, vi } from 'vitest'
import {
  candidatePaths,
  detectPrograms,
  hasCommandLineTools,
  isTrap,
  newestFirst,
  searchDirs
} from '../../src/main/runnerDetect'

const DOCK_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'

function fakeFs({ files = [], dirs = {}, links = {} } = {}) {
  return {
    readdir: (dir) => dirs[dir] ?? [],
    isProgramFile: (path) => files.includes(path),
    realpath: (path) => links[path] ?? path
  }
}

function versions(table) {
  return vi.fn(async ({ exe }) => table[exe] ?? null)
}

describe('searchDirs', () => {
  it('scans Homebrew on macOS even when a Dock launch left it off PATH', () => {
    const dirs = searchDirs({
      language: 'python',
      platform: 'darwin',
      env: { PATH: DOCK_PATH },
      home: '/Users/me'
    })
    expect(dirs).toEqual(expect.arrayContaining(['/opt/homebrew/bin', '/usr/local/bin']))
    expect(dirs).toContain('/Users/me/.pyenv/shims')
    expect(dirs.slice(0, 4)).toEqual(DOCK_PATH.split(':'))
  })

  it('looks for PHP in Herd and phpenv on macOS', () => {
    const dirs = searchDirs({ language: 'php', platform: 'darwin', env: {}, home: '/Users/me' })
    expect(dirs).toContain('/Users/me/Library/Application Support/Herd/bin')
    expect(dirs).toContain('/Users/me/.phpenv/shims')
  })

  it('adds the usual Linux folders after PATH', () => {
    const dirs = searchDirs({
      language: 'python',
      platform: 'linux',
      env: { PATH: '/opt/x/bin' },
      home: '/home/me'
    })
    expect(dirs).toEqual([
      '/opt/x/bin',
      '/usr/bin',
      '/usr/local/bin',
      '/home/me/.pyenv/shims',
      '/home/me/.local/bin'
    ])
  })

  it('splits a Windows Path on semicolons and adds the installer folders', () => {
    const dirs = searchDirs({
      language: 'python',
      platform: 'win32',
      env: { Path: 'C:\\Tools;C:\\Bin', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
      home: 'C:\\Users\\me'
    })
    expect(dirs.slice(0, 2)).toEqual(['C:\\Tools', 'C:\\Bin'])
    expect(dirs).toContain('C:\\Users\\me\\AppData\\Local\\Programs\\Python\\Python3*')
    expect(dirs).toContain('C:\\Users\\me\\scoop\\shims')
  })

  it('drops a relative PATH entry, which would resolve against the launch folder', () => {
    const dirs = searchDirs({
      language: 'php',
      platform: 'linux',
      env: { PATH: '.:bin::/usr/bin' },
      home: '/h'
    })
    expect(dirs.every((dir) => dir.startsWith('/'))).toBe(true)
  })
})

describe('candidatePaths', () => {
  it('expands a versioned folder', () => {
    const paths = candidatePaths({
      language: 'python',
      platform: 'darwin',
      env: {},
      home: '/Users/me',
      readdir: (dir) =>
        dir === '/Library/Frameworks/Python.framework/Versions' ? ['3.12', '3.11', 'Current'] : []
    })
    expect(paths).toContain('/Library/Frameworks/Python.framework/Versions/3.11/bin/python3')
    expect(paths).toContain('/Library/Frameworks/Python.framework/Versions/3.12/bin/python3')
  })

  it('matches a Windows folder by its prefix, and looks for both python.exe and py.exe', () => {
    const paths = candidatePaths({
      language: 'python',
      platform: 'win32',
      env: { ProgramFiles: 'C:\\Program Files' },
      home: 'C:\\Users\\me',
      readdir: (dir) => (dir === 'C:\\Program Files' ? ['Python312', 'Git', 'Python311'] : [])
    })
    expect(paths).toContain('C:\\Program Files\\Python312\\python.exe')
    expect(paths).toContain('C:\\Program Files\\Python311\\python.exe')
    expect(paths.some((path) => path.includes('Git'))).toBe(false)
    expect(paths).toContain('C:\\Windows\\py.exe')
  })

  it('finds Laragon PHP under each version folder', () => {
    const paths = candidatePaths({
      language: 'php',
      platform: 'win32',
      env: {},
      home: 'C:\\Users\\me',
      readdir: (dir) => (dir === 'C:\\laragon\\bin\\php' ? ['php-8.3.6-Win32'] : [])
    })
    expect(paths).toContain('C:\\laragon\\bin\\php\\php-8.3.6-Win32\\php.exe')
  })

  it('lists a folder once when PATH repeats it', () => {
    const paths = candidatePaths({
      language: 'php',
      platform: 'linux',
      env: { PATH: '/usr/bin:/usr/bin' },
      home: '/h',
      readdir: () => []
    })
    expect(paths.filter((path) => path === '/usr/bin/php')).toHaveLength(1)
  })
})

describe('curl', () => {
  it("prefers Homebrew's keg-only curl on macOS, then the system one", () => {
    const dirs = searchDirs({ language: 'curl', platform: 'darwin', env: {}, home: '/Users/me' })
    expect(dirs).toEqual([
      '/opt/homebrew/opt/curl/bin',
      '/usr/local/opt/curl/bin',
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin'
    ])
  })

  it('finds the curl.exe Windows ships in System32', () => {
    const paths = candidatePaths({
      language: 'curl',
      platform: 'win32',
      env: { SystemRoot: 'C:\\Windows' },
      home: 'C:\\Users\\me',
      readdir: () => []
    })
    expect(paths).toContain('C:\\Windows\\System32\\curl.exe')
  })

  it('looks in the usual Linux folders', () => {
    const paths = candidatePaths({
      language: 'curl',
      platform: 'linux',
      env: {},
      home: '/home/me',
      readdir: () => []
    })
    expect(paths).toEqual(['/usr/bin/curl', '/usr/local/bin/curl'])
  })
})

describe('isTrap', () => {
  it('skips the Windows Store alias', () => {
    const fs = fakeFs()
    const alias = 'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe'
    expect(isTrap(alias, { platform: 'win32', fs })).toBe(true)
    expect(isTrap('C:\\Python312\\python.exe', { platform: 'win32', fs })).toBe(false)
  })

  it("skips macOS's python3 stub while the Command Line Tools are missing", () => {
    const without = fakeFs()
    const withTools = fakeFs({ files: ['/Library/Developer/CommandLineTools/usr/bin/python3'] })
    expect(hasCommandLineTools(without)).toBe(false)
    expect(isTrap('/usr/bin/python3', { platform: 'darwin', fs: without })).toBe(true)
    expect(isTrap('/usr/bin/python3', { platform: 'darwin', fs: withTools })).toBe(false)
  })

  it('leaves Linux /usr/bin/python3 alone', () => {
    expect(isTrap('/usr/bin/python3', { platform: 'linux', fs: fakeFs() })).toBe(false)
  })
})

describe('newestFirst', () => {
  it('orders by each version part as a number', () => {
    const found = [
      { path: 'a', version: '3.9.6' },
      { path: 'b', version: '3.12.1' },
      { path: 'c', version: '3.11.9' }
    ]
    expect(newestFirst(found).map((f) => f.version)).toEqual(['3.12.1', '3.11.9', '3.9.6'])
  })
})

describe('detectPrograms', () => {
  const linux = { platform: 'linux', env: { PATH: '/usr/bin' }, home: '/home/me' }

  it('returns what answers as the language, newest first', async () => {
    const fs = fakeFs({ files: ['/usr/bin/python3', '/home/me/.pyenv/shims/python3'] })
    const readVersion = versions({
      '/usr/bin/python3': '3.11.2',
      '/home/me/.pyenv/shims/python3': '3.12.1'
    })
    const found = await detectPrograms({ ...linux, language: 'python', fs, readVersion })
    expect(found).toEqual([
      { path: '/home/me/.pyenv/shims/python3', version: '3.12.1' },
      { path: '/usr/bin/python3', version: '3.11.2' }
    ])
  })

  it('runs nothing that is not there', async () => {
    const readVersion = versions({})
    await detectPrograms({ ...linux, language: 'php', fs: fakeFs(), readVersion })
    expect(readVersion).not.toHaveBeenCalled()
  })

  it('drops a program that is not that language', async () => {
    const fs = fakeFs({ files: ['/usr/bin/php'] })
    const found = await detectPrograms({ ...linux, language: 'php', fs, readVersion: versions({}) })
    expect(found).toEqual([])
  })

  it('asks the same file once, under the first path it was found at', async () => {
    const fs = fakeFs({
      files: ['/usr/bin/python3', '/usr/local/bin/python3'],
      links: {
        '/usr/bin/python3': '/usr/bin/python3.11',
        '/usr/local/bin/python3': '/usr/bin/python3.11'
      }
    })
    const readVersion = versions({
      '/usr/bin/python3': '3.11.2',
      '/usr/local/bin/python3': '3.11.2'
    })
    const found = await detectPrograms({ ...linux, language: 'python', fs, readVersion })
    expect(found.map((f) => f.path)).toEqual(['/usr/bin/python3'])
    expect(readVersion).toHaveBeenCalledTimes(1)
  })

  it('never runs a trap', async () => {
    const alias = 'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe'
    const fs = fakeFs({ files: [alias] })
    const readVersion = versions({ [alias]: '3.12.0' })
    const found = await detectPrograms({
      language: 'python',
      platform: 'win32',
      env: { Path: 'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps' },
      home: 'C:\\Users\\me',
      fs,
      readVersion
    })
    expect(found).toEqual([])
    expect(readVersion).not.toHaveBeenCalled()
  })
})
