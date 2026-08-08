// The interactive `diffbro new snippet`. The reading is glue; what is testable
// is what it builds from the answers, and the shape of the conversation itself
// — driven with its IO handed in, because a pipe is not a TTY and an e2e
// feeding stdin can only ever reach the piped path.
import { describe, expect, it } from 'vitest'
import {
  SYNTAXES,
  bodyFrom,
  cliSnippetName,
  draftFrom,
  promptSnippet,
  syntaxFor,
  termFrom
} from '../../src/main/cliPrompt'

describe('syntaxFor', () => {
  it('takes a name from the list', () => {
    expect(syntaxFor('sql')).toBe('sql')
    expect(syntaxFor('SQL')).toBe('sql')
    expect(syntaxFor('  json  ')).toBe('json')
  })

  it('takes the number the list printed', () => {
    expect(syntaxFor('1')).toBe(SYNTAXES[0])
    expect(syntaxFor(String(SYNTAXES.length))).toBe(SYNTAXES.at(-1))
  })

  // An empty answer is the common one — Enter past the question.
  it('falls back to auto-detection for anything it does not recognise', () => {
    for (const said of ['', '   ', 'klingon', '0', String(SYNTAXES.length + 1), undefined]) {
      expect(syntaxFor(said)).toBe('auto')
    }
  })
})

// The body needs end markers that cannot appear in one by accident, matched
// only as the WHOLE line. `:wq` and `:x` join `:q` because the spelling invites
// vim fingers; `:a` abandons.
describe('bodyFrom', () => {
  it('collects every line until a save marker', () => {
    for (const end of [':wq', ':x']) {
      expect(bodyFrom(['one', 'two', end, 'after'])).toEqual({
        content: 'one\ntwo',
        cancelled: false
      })
    }
  })

  it('keeps blank lines, indentation and anything that merely contains :q', () => {
    const lines = ['select 1;', '', '  indented', 'echo ":wq"', 'a:wq', ':wq']
    expect(bodyFrom(lines).content).toBe('select 1;\n\n  indented\necho ":wq"\na:wq')
  })

  it('is not fooled by trailing whitespace around the marker', () => {
    expect(bodyFrom(['x', '  :wq  ']).content).toBe('x')
  })

  it('finishes at end of input', () => {
    expect(bodyFrom(['one', null])).toEqual({ content: 'one', cancelled: false })
  })

  it('takes an empty body as an empty body, not a cancel', () => {
    expect(bodyFrom([':wq'])).toEqual({ content: '', cancelled: false })
  })

  // Vim's meanings: :q quits WITHOUT writing, so it discards here too.
  it(':q and :a discard, and what was typed before them goes with it', () => {
    for (const end of [':q', ':a']) {
      expect(bodyFrom(['typed something', end])).toEqual({ content: '', cancelled: true })
    }
  })
})

describe('draftFrom', () => {
  const answers = { name: 'Deploy notes', syntax: 'sql', content: 'select 1;' }

  it('carries the answers through', () => {
    expect(draftFrom(answers)).toEqual({
      name: 'Deploy notes',
      language: 'sql',
      content: 'select 1;',
      tags: ['cli']
    })
  })

  // The tag is the whole point of the ask: a snippet made from the terminal is
  // findable as one afterwards.
  it('always tags it cli, whatever was typed', () => {
    expect(draftFrom({ ...answers, name: '' }).tags).toEqual(['cli'])
  })

  it('adds the tags the reader gave, and drops the empty ones', () => {
    expect(draftFrom({ ...answers, tags: ['db', '  ', 'ops'] }).tags).toEqual(['cli', 'db', 'ops'])
  })

  it('trims the name, and names an unnamed one after where it came from', () => {
    expect(draftFrom({ ...answers, name: '  spaced  ' }).name).toBe('spaced')
    expect(draftFrom({ ...answers, name: '   ' }).name).toMatch(/ - cli snippet$/)
  })

  // Content is the one thing worth refusing: a snippet with no body is not a
  // snippet, and the terminal is where saying so costs nothing.
  it('refuses an empty body', () => {
    expect(draftFrom({ ...answers, content: '' })).toBeNull()
    expect(draftFrom({ ...answers, content: '  \n \n' })).toBeNull()
  })

  it('keeps the body verbatim, including its blank lines and indentation', () => {
    const content = 'line one\n\n    indented\nlast'
    expect(draftFrom({ ...answers, content }).content).toBe(content)
  })
})

// The confirmation is written to STDOUT, so whether to colour it is a question
// about stdout. Asking stderr meant `… > out.txt` from a terminal (stdout a
// file, stderr still a TTY) wrote escape codes into the file.
describe('termFrom — which stream is being asked about', () => {
  it('is colourless for a redirected stream even when the other is a terminal', () => {
    expect(termFrom({}, { isTTY: false, columns: 80 }).colour).toBe(false)
  })

  it('colours a terminal', () => {
    expect(termFrom({}, { isTTY: true, columns: 80 }).colour).toBe(true)
  })

  it('obeys NO_COLOR', () => {
    expect(termFrom({ NO_COLOR: '1' }, { isTTY: true, columns: 80 }).colour).toBe(false)
  })

  it('falls back to 80 columns when the stream does not say', () => {
    expect(termFrom({}, { isTTY: true }).width).toBe(80)
  })
})

describe('promptSnippet — the conversation', () => {
  const scripted = (answers, { isTty = true } = {}) => {
    const said = [...answers]
    const written = []
    const state = { written, closed: false }
    state.io = {
      isTty,
      ask: async (question) => {
        written.push(question)
        return said.length ? said.shift() : null
      },
      readAll: async () => said.join('\n'),
      write: (text) => written.push(text),
      close: () => (state.closed = true),
      term: { colour: false, width: 80 }
    }
    return state
  }

  it('asks for a name, a syntax and a body, in that order', async () => {
    const s = scripted(['Deploy notes', 'sql', 'select 1;', ':wq'])
    expect(await promptSnippet({}, s.io)).toEqual({
      name: 'Deploy notes',
      language: 'sql',
      content: 'select 1;',
      tags: ['cli']
    })
    const t = s.written.join('')
    expect(t).toContain('Name')
    expect(t).toContain('Syntax')
    expect(t).toContain('Content')
  })

  // The help was written AFTER the answer came back, so the reader was asked to
  // pick from a list they could not see yet.
  it('shows the syntax list before asking which one', async () => {
    const s = scripted(['n', 'sql', 'x', ':wq'])
    await promptSnippet({}, s.io)
    const t = s.written.join('')
    expect(t.indexOf('plaintext')).toBeLessThan(t.indexOf('Syntax'))
    expect(t.indexOf('plaintext')).toBeGreaterThan(t.indexOf('Name'))
  })

  it('skips a question a flag already answered', async () => {
    const s = scripted(['select 1;', ':wq'])
    const draft = await promptSnippet({ name: 'Prod', syntax: 'sql' }, s.io)
    expect(draft.name).toBe('Prod')
    expect(draft.language).toBe('sql')
    expect(s.written.join('')).not.toContain('Name')
  })

  it('carries --tag alongside the cli tag', async () => {
    const s = scripted(['x', ':wq'])
    const draft = await promptSnippet({ name: 'n', syntax: 'sql', tag: ['db', 'ops'] }, s.io)
    expect(draft.tags).toEqual(['cli', 'db', 'ops'])
  })

  // Typed text is not ASCII. Decoding it a byte at a time turned every
  // continuation byte into U+FFFD and saved mojibake, silently.
  it('keeps multi-byte characters exactly as they were typed', async () => {
    const s = scripted(['Café ✓ Привет', 'sql', 'select — 日本 🎉', ':wq'])
    const draft = await promptSnippet({}, s.io)
    expect(draft.name).toBe('Café ✓ Привет')
    expect(draft.content).toBe('select — 日本 🎉')
  })

  // The old version exited on an empty body and took the name and syntax with
  // it — the two things the reader had already answered.
  it('asks again for an empty body instead of throwing the answers away', async () => {
    const s = scripted(['Deploy notes', 'sql', ':wq', 'select 1;', ':wq'])
    const draft = await promptSnippet({}, s.io)
    expect(draft.name).toBe('Deploy notes')
    expect(draft.content).toBe('select 1;')
    expect(s.written.join('')).toContain('Nothing typed')
  })

  it('gives up after the second empty body rather than looping', async () => {
    expect(await promptSnippet({}, scripted(['n', 'sql', ':wq', ':wq']).io)).toBeNull()
  })

  it(':q discards outright, without asking again', async () => {
    const s = scripted(['n', 'sql', 'typed something', ':q'])
    expect(await promptSnippet({}, s.io)).toBeNull()
    expect(s.written.join('')).not.toContain('Nothing typed')
  })

  // Ctrl+C and end-of-input both surface as a null answer.
  it('gives up when an answer comes back null', async () => {
    expect(await promptSnippet({}, scripted([]).io)).toBeNull()
    expect(await promptSnippet({}, scripted(['a name']).io)).toBeNull()
  })

  it('always closes the reader, however it ended', async () => {
    const done = scripted(['n', 'sql', 'x', ':wq'])
    await promptSnippet({}, done.io)
    expect(done.closed).toBe(true)

    const gaveUp = scripted([])
    await promptSnippet({}, gaveUp.io)
    expect(gaveUp.closed).toBe(true)
  })

  // Piped: nobody saw a prompt, so nothing is a reply to one.
  it('reads the whole of stdin as the body when it is not a terminal', async () => {
    const s = scripted(['line one', 'line two'], { isTty: false })
    const draft = await promptSnippet({ name: 'Piped' }, s.io)
    expect(draft.content).toBe('line one\nline two')
    expect(s.written).toEqual([])
  })

  it('refuses an empty pipe rather than saving nothing', async () => {
    expect(await promptSnippet({ name: 'Piped' }, scripted([''], { isTty: false }).io)).toBeNull()
  })
})

// An unnamed snippet made from the terminal says so, and when. The store's own
// fallback is "Untitled <date>", which loses where it came from.
describe('cliSnippetName', () => {
  const at = new Date(2026, 7, 8, 9, 5)

  it('is a timestamp and where it came from', () => {
    expect(cliSnippetName(at)).toBe('2026-08-08 09:05 - cli snippet')
  })

  it('is what an empty name falls back to', () => {
    const draft = draftFrom({ name: '   ', content: 'x', now: at })
    expect(draft.name).toBe('2026-08-08 09:05 - cli snippet')
  })

  it('never displaces a name that was given', () => {
    expect(draftFrom({ name: 'Mine', content: 'x', now: at }).name).toBe('Mine')
  })
})
