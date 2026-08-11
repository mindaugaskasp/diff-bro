// The list git is walking, and every reason a row can refuse to be acted on.
// Pure core, so none of this needs a repository.
import { describe, expect, it } from 'vitest'
import {
  conflictTally,
  entryFor,
  isRepoRelative,
  pickEntry,
  visibleEntries
} from '../../src/main/conflictList'

const text = (s) => Buffer.from(s, 'utf8')

const CONFLICTED = `head
<<<<<<< HEAD
ours
=======
theirs
>>>>>>> feature
middle
<<<<<<< HEAD
ours again
=======
theirs again
>>>>>>> feature
tail
`

describe('conflictTally', () => {
  it('counts the regions git opened', () => {
    expect(conflictTally(CONFLICTED)).toBe(2)
  })

  it('is zero for a file with none', () => {
    expect(conflictTally('nothing here\n')).toBe(0)
  })

  // The same seven-characters-then-space-or-EOL rule mergeGuards enforces: a
  // line merely STARTING with them is ordinary text, and counting it would put
  // a number on the row that the merge view then disagrees with.
  it('ignores a line that merely starts with the marker characters', () => {
    expect(conflictTally('<<<<<<<<not a marker\n')).toBe(0)
    expect(conflictTally('<<<<<<< HEAD\n=======\n>>>>>>> x\n')).toBe(1)
  })

  it('survives a CRLF file', () => {
    expect(conflictTally('<<<<<<< HEAD\r\n=======\r\n>>>>>>> x\r\n')).toBe(1)
  })
})

describe('entryFor', () => {
  it('describes a text conflict with its name, directory and tally', () => {
    expect(entryFor({ rel: 'src/main/cliRoute.js', buffer: text(CONFLICTED) })).toEqual({
      rel: 'src/main/cliRoute.js',
      name: 'cliRoute.js',
      dir: 'src/main',
      tally: 2,
      state: 'open'
    })
  })

  // A file at the repository root has no directory to show; the renderer
  // decides what to call that, because copy lives in the catalogue.
  it('leaves the directory empty for a file at the root', () => {
    expect(entryFor({ rel: 'package-lock.json', buffer: text(CONFLICTED) }).dir).toBe('')
  })

  // git calls the mergetool for a binary conflict too, and leaves no markers in
  // it. Opening one as text would decode every invalid byte to U+FFFD.
  it('blocks a binary file', () => {
    const entry = entryFor({
      rel: 'resources/icon.png',
      buffer: Buffer.from([0x89, 0x50, 0x00, 0x4e])
    })
    expect(entry.state).toBe('blocked')
    expect(entry.tally).toBe(0)
  })

  it('blocks a file past the size ceiling rather than reading it', () => {
    const entry = entryFor({ rel: 'huge.json', buffer: text('x'), size: 33 * 1024 * 1024 })
    expect(entry.state).toBe('blocked')
  })

  // Unreadable is not resolvable, but it is still a row: hiding it would make
  // the tally disagree with what git says is left.
  it('blocks a file it could not read', () => {
    expect(entryFor({ rel: 'gone.js', buffer: null }).state).toBe('blocked')
  })
})

describe('visibleEntries', () => {
  const paths = ['a.js', 'b.js']
  const read = (rel) => ({ buffer: rel === 'a.js' ? text(CONFLICTED) : text('plain\n') })

  it('keeps git’s own order', () => {
    expect(visibleEntries({ paths, read }).map((e) => e.name)).toEqual(['a.js', 'b.js'])
  })

  // A file with no markers left is one this tool has no business rewriting —
  // the same refusal routeMerge already makes for a single file.
  it('blocks a conflicted path whose working copy has no markers', () => {
    expect(visibleEntries({ paths, read })[1].state).toBe('blocked')
  })

  it('marks the paths already resolved this session', () => {
    const entries = visibleEntries({ paths, read, resolved: new Set(['b.js']) })
    expect(entries.map((e) => e.state)).toEqual(['open', 'done'])
  })
})

describe('pickEntry', () => {
  const entries = [
    { rel: 'a.js', state: 'open' },
    { rel: 'b.js', state: 'done' }
  ]

  it('answers the entry at that index', () => {
    expect(pickEntry(entries, 0)).toEqual(entries[0])
  })

  // The renderer sends an INDEX and nothing else, so every shape it could send
  // has to fail closed rather than reach a path.
  it('refuses an index that is not one of them', () => {
    for (const bad of [-1, 2, 1.5, '0', null, undefined, NaN, Infinity]) {
      expect(pickEntry(entries, bad)).toBe(null)
    }
  })
})

describe('isRepoRelative', () => {
  it('accepts a path inside the repository', () => {
    expect(isRepoRelative('src/main/cliRoute.js')).toBe(true)
  })

  // git speaks posix paths in its own output, and a path that climbs out of the
  // repository is not a path in it. These are the shapes that would turn an
  // index into a write somewhere else.
  it('refuses anything that leaves it, or that could read as an option', () => {
    for (const bad of [
      '../outside.js',
      'src/../../etc/passwd',
      '/etc/passwd',
      '-oProxyCommand',
      '',
      null,
      42
    ]) {
      expect(isRepoRelative(bad)).toBe(false)
    }
  })

  it('refuses a windows separator climbing out', () => {
    expect(isRepoRelative('src\\..\\..\\etc\\passwd')).toBe(false)
  })
})
