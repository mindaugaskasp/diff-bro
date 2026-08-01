import { describe, expect, it } from 'vitest'
import { cliWords, parseCli } from '../../src/main/cli'

// Argv reaches the app in three shapes — packaged, dev, and forwarded by
// second-instance — and Chromium switches can be mixed in anywhere. Every case
// below is one of those shapes carrying the same command.
const PACKAGED = ['/Applications/Diff Bro.app/Contents/MacOS/Diff Bro']
const DEV = ['/repo/node_modules/electron/dist/electron', '.']

describe('cliWords', () => {
  it('drops the executable', () => {
    expect(cliWords([...PACKAGED, 'compare', 'a.json'])).toEqual(['compare', 'a.json'])
  })

  it('drops the entry point of a dev run as well as the binary', () => {
    expect(cliWords([...DEV, 'compare', 'a.json'])).toEqual(['compare', 'a.json'])
  })

  it('ignores Chromium switches', () => {
    const argv = [...PACKAGED, '--user-data-dir=/tmp/x', 'cb', '--enable-logging', 'save']
    expect(cliWords(argv)).toEqual(['cb', 'save'])
  })

  it('is empty for a plain launch', () => {
    expect(cliWords(PACKAGED)).toEqual([])
    expect(cliWords(DEV)).toEqual([])
  })
})

describe('parseCli — compare', () => {
  it('takes one file', () => {
    const { command } = parseCli([...PACKAGED, 'compare', 'a.json'])
    expect(command).toEqual({ name: 'compare', files: ['a.json'] })
  })

  it('takes two files', () => {
    const { command } = parseCli([...PACKAGED, 'compare', 'a.json', 'b.json'])
    expect(command.files).toEqual(['a.json', 'b.json'])
  })

  // The CLI runs in the user's shell, so a relative path means relative to
  // THEIR cwd, not the app's.
  it('resolves paths against the caller cwd', () => {
    const { command } = parseCli([...PACKAGED, 'compare', 'a.json'], (p) => `/work/${p}`)
    expect(command.files).toEqual(['/work/a.json'])
  })

  it('refuses a third file rather than silently dropping it', () => {
    const { command, error } = parseCli([...PACKAGED, 'compare', 'a', 'b', 'c'])
    expect(command).toBeNull()
    expect(error).toMatch(/at most two/)
  })

  it('refuses with no file at all', () => {
    expect(parseCli([...PACKAGED, 'compare']).error).toMatch(/needs a file/)
  })
})

describe('parseCli — the other verbs', () => {
  it('reads `create snippet`', () => {
    expect(parseCli([...PACKAGED, 'create', 'snippet']).command).toEqual({
      name: 'create-snippet'
    })
  })

  it('reads `cb save`', () => {
    expect(parseCli([...PACKAGED, 'cb', 'save']).command).toEqual({ name: 'clipboard-save' })
  })

  it('reports an unknown command instead of doing nothing', () => {
    expect(parseCli([...PACKAGED, 'frobnicate']).error).toMatch(/Unknown command/)
    expect(parseCli([...PACKAGED, 'create', 'diff']).error).toMatch(/Unknown command/)
  })

  // A double-click or a Dock launch carries no words; that must stay a normal
  // start, never an error.
  it('is a no-op with no arguments', () => {
    expect(parseCli(PACKAGED)).toEqual({ command: null, error: null })
  })
})
