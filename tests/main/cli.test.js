import { describe, expect, it } from 'vitest'
import { cliWords, helpText, parseCli } from '../../src/main/cli'
import { COMMANDS } from '../../src/shared/cliCommands'

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

  // The entry point is whatever path the launcher passes; it is NOT always named
  // after the package. A clone directory called anything else used to be read as
  // a command and killed the launch before a window existed.
  it('drops an entry path whatever the checkout is called', () => {
    expect(cliWords(['/usr/bin/electron', '/Users/x/Projects/diff-bro'])).toEqual([])
    expect(cliWords(['/usr/bin/electron', '/Users/x/src/my-fork', 'compare', 'a', 'b'])).toEqual([
      'compare',
      'a',
      'b'
    ])
    expect(cliWords(['/usr/bin/electron', 'C:\\work\\checkout'])).toEqual([])
  })

  // A path is the only thing that may be skipped as an entry — a bare misspelled
  // word must still reach parseCli so it can be reported.
  it('keeps a bare word that is not a path', () => {
    expect(cliWords([...PACKAGED, 'frobnicate'])).toEqual(['frobnicate'])
  })
})

describe('parseCli — compare', () => {
  it('takes one file', () => {
    const { command } = parseCli([...PACKAGED, 'compare', 'a.json'])
    expect(command).toEqual({ name: 'compare', files: ['a.json'], transient: false })
  })

  // What the git difftool launcher runs. Same comparison, flagged as one git
  // made throwaway copies for, so a merge with more conflicts than tabs can
  // recycle them rather than running out.
  it('marks a difftool launch as throwaway', () => {
    const { command } = parseCli([...PACKAGED, 'difftool', 'before/a.json', 'after/a.json'])
    expect(command).toEqual({
      name: 'compare',
      files: ['before/a.json', 'after/a.json'],
      transient: true
    })
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

// `open` is the documented spelling of "put the app in front of me", and with a
// path it is `compare`'s one-file behaviour under a name that reads like opening.
describe('parseCli — open', () => {
  it('raises the app with no path', () => {
    expect(parseCli([...PACKAGED, 'open'])).toEqual({
      command: { name: 'raise' },
      error: null
    })
  })

  it('opens one file as a comparison waiting for its second side', () => {
    const { command, error } = parseCli([...PACKAGED, 'open', 'a.json'], (p) => `/cwd/${p}`)
    expect(error).toBe(null)
    expect(command).toEqual({ name: 'compare', files: ['/cwd/a.json'], transient: false })
  })

  // Two paths is `compare`. Accepting them here would make the verbs synonyms.
  it('refuses a second path rather than becoming compare', () => {
    const { command, error } = parseCli([...PACKAGED, 'open', 'a.json', 'b.json'])
    expect(command).toBe(null)
    expect(error).toMatch(/one file/i)
  })

  it('rejects an empty path instead of resolving it to the cwd', () => {
    expect(parseCli([...PACKAGED, 'open', '   ']).command).toEqual({ name: 'raise' })
  })
})

describe('parseCli — backup', () => {
  it('takes the destination, resolved against the caller cwd', () => {
    const { command, error } = parseCli([...PACKAGED, 'backup', 'out.zip'], (p) => `/cwd/${p}`)
    expect(error).toBe(null)
    expect(command).toEqual({ name: 'backup', path: '/cwd/out.zip' })
  })

  it('refuses with no destination — a backup nowhere is not a default', () => {
    const { command, error } = parseCli([...PACKAGED, 'backup'])
    expect(command).toBe(null)
    expect(error).toMatch(/path/i)
  })

  it('refuses a second destination', () => {
    expect(parseCli([...PACKAGED, 'backup', 'a.zip', 'b.zip']).command).toBe(null)
  })

  it('rejects an empty destination', () => {
    expect(parseCli([...PACKAGED, 'backup', '  ']).command).toBe(null)
  })
})

describe('parseCli — the other verbs', () => {
  it('reads `create snippet`', () => {
    expect(parseCli([...PACKAGED, 'create', 'snippet']).command).toEqual({
      name: 'create-snippet'
    })
  })

  it('reads `clipboard save`', () => {
    expect(parseCli([...PACKAGED, 'clipboard', 'save']).command).toEqual({ name: 'clipboard-save' })
  })

  // Renamed from `cb`, so the old spelling must report rather than silently
  // do nothing — a stale muscle-memory command that no-ops is the worst answer.
  it('reports the retired `cb` spelling instead of ignoring it', () => {
    expect(parseCli([...PACKAGED, 'cb', 'save']).error).toMatch(/Unknown command/)
  })

  it('reports an unknown command instead of doing nothing', () => {
    expect(parseCli([...PACKAGED, 'frobnicate']).error).toMatch(/Unknown command/)
    expect(parseCli([...PACKAGED, 'create', 'diff']).error).toMatch(/Unknown command/)
  })

  // Launching by absolute path is a normal start, not a typo: erroring here
  // exits before any window exists, so the app never opens at all.
  it('starts normally when launched by an absolute checkout path', () => {
    expect(parseCli(['/usr/bin/electron', '/Users/x/Projects/diff-bro'])).toEqual({
      command: null,
      error: null
    })
  })

  // A double-click or a Dock launch carries no words; that must stay a normal
  // start, never an error.
  it('is a no-op with no arguments', () => {
    expect(parseCli(PACKAGED)).toEqual({ command: null, error: null })
  })
})

// Argv is whatever a shell handed over: empty words, paths that are directories
// or do not exist, absurd lengths, and switch-lookalikes. Parsing must answer
// for all of it rather than throw — the reader is what decides a path is bad.
describe('parseCli — hostile argv', () => {
  it('does not treat a directory or a missing path as special', () => {
    const { command, error } = parseCli([...PACKAGED, 'compare', '/tmp', '/no/such/file'])
    expect(error).toBeNull()
    expect(command.files).toEqual(['/tmp', '/no/such/file'])
  })

  it('keeps a path that looks like a flag out of the switch filter’s reach', () => {
    // A real file can be named "-weird"; it arrives as a switch and is dropped,
    // so `compare` is left with nothing and says so instead of opening junk.
    expect(parseCli([...PACKAGED, 'compare', '-weird']).error).toMatch(/needs a file/)
  })

  it('rejects an empty path instead of resolving it to the cwd', () => {
    expect(parseCli([...PACKAGED, 'compare', '']).error).toMatch(/needs a file/)
  })

  it('survives argv that is empty, sparse, or not strings at all', () => {
    expect(() => parseCli([])).not.toThrow()
    expect(() => parseCli(undefined)).not.toThrow()
    expect(() => parseCli([null, undefined, 42, {}])).not.toThrow()
    expect(parseCli([]).command).toBeNull()
  })

  it('does not choke on an absurdly long path or odd characters', () => {
    const long = '/tmp/' + 'x'.repeat(5000)
    expect(parseCli([...PACKAGED, 'compare', long]).command.files).toEqual([long])
    const odd = '/tmp/a b\tc\nd é 🙂.json'
    expect(parseCli([...PACKAGED, 'compare', odd]).command.files).toEqual([odd])
  })

  it('treats a half-typed subcommand as unknown rather than guessing', () => {
    expect(parseCli([...PACKAGED, 'create']).error).toMatch(/Unknown command/)
    expect(parseCli([...PACKAGED, 'cb']).error).toMatch(/Unknown command/)
    expect(parseCli([...PACKAGED, 'cb', 'delete']).error).toMatch(/Unknown command/)
  })

  it('reads help in every spelling, and carries the topic', () => {
    expect(parseCli([...PACKAGED, 'help']).command).toEqual({ name: 'help', topic: null })
    expect(parseCli([...PACKAGED, '--help']).command.name).toBe('help')
    expect(parseCli([...PACKAGED, '-h']).command.name).toBe('help')
    expect(parseCli([...PACKAGED, 'help', 'compare']).command.topic).toBe('compare')
  })
})

describe('helpText', () => {
  it('lists every command it can parse, so the two cannot drift', () => {
    const { text } = helpText()
    for (const c of COMMANDS) expect(text).toContain(c.usage)
  })

  it('explains one command', () => {
    const { text, ok } = helpText('compare')
    expect(ok).toBe(true)
    expect(text).toContain('diffbro compare')
    expect(text).toMatch(/never over the one on screen/)
  })

  it('falls back to the list, and reports failure, for an unknown topic', () => {
    const { text, ok } = helpText('nope')
    expect(ok).toBe(false)
    expect(text).toContain('No help for "nope"')
    expect(text).toContain('diffbro compare')
  })
})

// `new snippet` is the one verb with options, and argv is shared with Chromium:
// cliWords strips anything dash-prefixed so a `--enable-logging` cannot be read
// as ours. Our own flags are therefore known BY NAME — the one place in this
// file where a name, not a shape, decides.
describe('parseCli — create snippet --interactive', () => {
  const parse = (...words) => parseCli([...PACKAGED, ...words])

  // Without the flag it is the verb it always was: open the empty editor.
  it('opens the editor without the flag', () => {
    expect(parse('create', 'snippet').command).toEqual({ name: 'create-snippet' })
  })

  it('asks in the terminal with it, long or short', () => {
    for (const flag of ['--interactive', '-i']) {
      expect(parse('create', 'snippet', flag).command).toEqual({ name: 'new-snippet', flags: {} })
    }
  })

  it('refuses a noun it does not make', () => {
    expect(parse('create', 'diff').error).toMatch(/Unknown command/)
    expect(parse('create').error).toMatch(/Unknown command/)
  })

  it('takes the name, syntax and tags as flags', () => {
    const { command } = parse(
      'create',
      'snippet',
      '-i',
      '--name',
      'Prod schema',
      '--syntax',
      'sql',
      '--tag',
      'db',
      '--tag',
      'ops'
    )
    expect(command.flags).toEqual({ name: 'Prod schema', syntax: 'sql', tag: ['db', 'ops'] })
  })

  it('takes --flag=value too', () => {
    const { command } = parse('create', 'snippet', '-i', '--name=Quick', '--tag=db')
    expect(command.flags).toEqual({ name: 'Quick', tag: ['db'] })
  })

  it('still drops Chromium switches, which are not ours', () => {
    const { command } = parse('create', 'snippet', '-i', '--enable-logging', '--name', 'X')
    expect(command.flags).toEqual({ name: 'X' })
  })

  it('reports a flag given no value rather than swallowing the next word', () => {
    expect(parse('create', 'snippet', '-i', '--name').error).toMatch(/--name needs a value/)
  })
})

// Carving our flags out of the GLOBAL switch strip changed every other verb.
// A bare launch carrying any dash-prefixed argument used to be ignored; read as
// a command it exits 1 before a window exists — the app refuses to start.
describe('parseCli — our flags stay inside `new snippet`', () => {
  // A switch our flag list happens to name must still be STRIPPED on a launch
  // that is not `new snippet` — read as a verb it exits 1 before a window
  // exists, so the app refuses to start.
  it('a launch carrying one of our flag names is still a plain launch', () => {
    expect(parseCli([...PACKAGED, '--name'])).toEqual({ command: null, error: null })
    expect(parseCli([...PACKAGED, '--syntax', '--tag'])).toEqual({ command: null, error: null })
  })

  it('compare still strips them rather than counting them as files', () => {
    const { command, error } = parseCli([...PACKAGED, 'compare', 'a.txt', '--name', 'b.txt'])
    expect(error).toBeNull()
    expect(command.files).toEqual(['a.txt', 'b.txt'])
  })
})

// The docstring claimed a flag with no value errors; it swallowed the next word.
describe('parseCli — create snippet, flags given no value', () => {
  const parse = (...w) => parseCli([...PACKAGED, 'create', 'snippet', '-i', ...w])

  it('refuses a flag followed by another flag instead of eating it', () => {
    expect(parse('--name', '--syntax', 'sql').error).toMatch(/--name needs a value/)
    expect(parse('--syntax', '--name', 'X').error).toMatch(/--syntax needs a value/)
    expect(parse('--tag', '--tag', 'x').error).toMatch(/--tag needs a value/)
  })

  it('refuses an empty --name= rather than saving an unnamed snippet', () => {
    expect(parse('--name=').error).toMatch(/--name needs a value/)
  })

  it('refuses the same flag twice rather than silently keeping the last', () => {
    expect(parse('--name', 'a', '--name', 'b').error).toMatch(/--name given twice/)
  })

  it('still allows --tag more than once, which is the repeatable one', () => {
    expect(parse('--tag', 'a', '--tag', 'b').command.flags.tag).toEqual(['a', 'b'])
  })
})
