// The interactive `diffbro new snippet`. The PROMPTING is glue — a synchronous
// line reader, because the cold CLI path runs before the single-instance lock
// and cannot await. What is testable is what it builds from the answers.
import { describe, expect, it } from 'vitest'
import {
  SYNTAXES,
  bodyFrom,
  draftFrom,
  promptSnippet,
  readLineFrom,
  syntaxFor
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
    expect(syntaxFor('')).toBe('auto')
    expect(syntaxFor('   ')).toBe('auto')
    expect(syntaxFor('klingon')).toBe('auto')
    expect(syntaxFor('0')).toBe('auto')
    expect(syntaxFor(String(SYNTAXES.length + 1))).toBe('auto')
    expect(syntaxFor(undefined)).toBe('auto')
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

  it('trims the name and lets an empty one fall through to the store', () => {
    expect(draftFrom({ ...answers, name: '  spaced  ' }).name).toBe('spaced')
    expect(draftFrom({ ...answers, name: '   ' }).name).toBe('')
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

// The body is many lines, so it needs a terminator that cannot appear in one by
// accident. `:q` is the vim spelling and finishes the snippet; Ctrl+C is the
// universal cancel and is handled as a signal, not a line.
describe('bodyFrom', () => {
  it('collects every line until :q', () => {
    expect(bodyFrom(['one', 'two', ':q', 'after'])).toEqual({
      content: 'one\ntwo',
      cancelled: false
    })
  })

  it('keeps blank lines, indentation and anything that merely contains :q', () => {
    const lines = ['select 1;', '', '  indented', 'echo ":q"', 'a:q', ':q']
    expect(bodyFrom(lines).content).toBe('select 1;\n\n  indented\necho ":q"\na:q')
  })

  it('is not fooled by trailing whitespace around the terminator', () => {
    expect(bodyFrom(['x', '  :q  ']).content).toBe('x')
  })

  // EOF (Ctrl+D) is the other conventional "that is all".
  it('finishes at end of input', () => {
    expect(bodyFrom(['one', null])).toEqual({ content: 'one', cancelled: false })
  })

  it('takes an empty body as an empty body, not a cancel', () => {
    expect(bodyFrom([':q'])).toEqual({ content: '', cancelled: false })
  })
})

// The whole conversation, driven without a terminal. A pipe is NOT a TTY, so an
// e2e feeding stdin can only ever exercise the piped path — the interactive one
// is reachable only by handing the IO in.
describe('promptSnippet — the conversation', () => {
  const scripted = (answers, { isTty = true } = {}) => {
    const said = [...answers]
    const written = []
    return {
      io: {
        isTty,
        readLine: () => (said.length ? said.shift() : null),
        readAll: () => said.join('\n'),
        write: (t) => written.push(t),
        term: { colour: false, width: 80 }
      },
      written,
      left: said
    }
  }

  it('asks for a name, a syntax and a body, in that order', () => {
    const { io, written } = scripted(['Deploy notes', 'sql', 'select 1;', ':q'])
    expect(promptSnippet({}, io)).toEqual({
      name: 'Deploy notes',
      language: 'sql',
      content: 'select 1;',
      tags: ['cli']
    })
    const transcript = written.join('')
    expect(transcript).toContain('Name')
    expect(transcript).toContain('Syntax')
    expect(transcript).toContain('Content')
  })

  it('skips a question a flag already answered', () => {
    const { io, written } = scripted(['select 1;', ':q'])
    const draft = promptSnippet({ name: 'Prod', syntax: 'sql' }, io)
    expect(draft.name).toBe('Prod')
    expect(draft.language).toBe('sql')
    expect(written.join('')).not.toContain('Name')
  })

  it('carries --tag alongside the cli tag', () => {
    const { io } = scripted(['x', ':q'])
    expect(promptSnippet({ name: 'n', syntax: 'sql', tag: ['db', 'ops'] }, io).tags).toEqual([
      'cli',
      'db',
      'ops'
    ])
  })

  // The old version exited on an empty body and took the name and syntax with
  // it — the two things the reader had already answered.
  it('asks again for an empty body instead of throwing the answers away', () => {
    const { io, written } = scripted(['Deploy notes', 'sql', ':q', 'select 1;', ':q'])
    const draft = promptSnippet({}, io)
    expect(draft.name).toBe('Deploy notes')
    expect(draft.content).toBe('select 1;')
    expect(written.join('')).toContain('Nothing typed')
  })

  it('gives up after the second empty body rather than looping', () => {
    const { io } = scripted(['n', 'sql', ':q', ':q'])
    expect(promptSnippet({}, io)).toBeNull()
  })

  it(':a abandons it outright, without asking again', () => {
    const { io, written } = scripted(['n', 'sql', 'typed something', ':a'])
    expect(promptSnippet({}, io)).toBeNull()
    expect(written.join('')).not.toContain('Nothing typed')
  })

  it('takes :wq and :x as well, because the spelling invites vim fingers', () => {
    for (const end of [':wq', ':x']) {
      const { io } = scripted(['n', 'sql', 'body', end])
      expect(promptSnippet({}, io).content).toBe('body')
    }
  })

  // Piped: nobody saw a prompt, so nothing is a reply to one.
  it('reads the whole of stdin as the body when it is not a terminal', () => {
    const { io, written } = scripted(['line one', 'line two'], { isTty: false })
    const draft = promptSnippet({ name: 'Piped' }, io)
    expect(draft.content).toBe('line one\nline two')
    expect(written).toEqual([])
  })

  it('refuses an empty pipe rather than saving nothing', () => {
    const { io } = scripted([''], { isTty: false })
    expect(promptSnippet({ name: 'Piped' }, io)).toBeNull()
  })
})

// A real terminal hands back EAGAIN when no key has been pressed yet — fd 0 is
// non-blocking there. Treating that as end-of-input made every prompt return
// instantly, so `diffbro new snippet` in an actual shell asked nothing and
// exited "Nothing to save." Neither the injected-IO units nor the piped e2e
// could see it: only a TTY produces EAGAIN.
describe('readLineFrom — a terminal that has not been typed into yet', () => {
  const eagain = () =>
    Object.assign(new Error('resource temporarily unavailable'), { code: 'EAGAIN' })

  it('waits through EAGAIN instead of reading it as end of input', () => {
    const script = [eagain, eagain, 'h', 'i', '\n']
    let i = 0
    const read = (buf) => {
      const next = script[i++]
      if (typeof next === 'function') throw next()
      if (next === undefined) return 0
      buf.write(next)
      return 1
    }
    expect(readLineFrom(read, () => {})).toBe('hi')
  })

  it('still treats a real end of input as the end', () => {
    const read = () => 0
    expect(readLineFrom(read, () => {})).toBeNull()
  })

  it('still treats an error that is not EAGAIN as the end', () => {
    const read = () => {
      throw Object.assign(new Error('bad fd'), { code: 'EBADF' })
    }
    expect(readLineFrom(read, () => {})).toBeNull()
  })

  it('keeps what was typed before the stream ended mid-line', () => {
    const script = ['a', 'b']
    let i = 0
    const read = (buf) => {
      if (i >= script.length) return 0
      buf.write(script[i++])
      return 1
    }
    expect(readLineFrom(read, () => {})).toBe('ab')
  })

  // Blocking the whole process in a tight loop would peg a core while someone
  // decides what to type.
  it('sleeps between retries rather than spinning', () => {
    let slept = 0
    const script = [eagain, eagain, '\n']
    let i = 0
    const read = (buf) => {
      const next = script[i++]
      if (typeof next === 'function') throw next()
      buf.write(next)
      return 1
    }
    readLineFrom(read, () => slept++)
    expect(slept).toBe(2)
  })
})
