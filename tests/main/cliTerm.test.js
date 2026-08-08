// How the prompt PRESENTS itself. Pure, so the parts that decide what a reader
// sees are testable without a terminal — the reading and writing stay glue.
import { describe, expect, it } from 'vitest'
import { handoffText, paint, syntaxHelp, termFrom } from '../../src/main/cliTerm'

const ESC = String.fromCharCode(27)
const plain = { colour: false }
const colour = { colour: true }

describe('paint', () => {
  it('wraps in the ANSI code when colour is on', () => {
    expect(paint('dim', 'x', colour)).toBe(`${ESC}[2mx${ESC}[0m`)
    expect(paint('green', 'ok', colour)).toBe(`${ESC}[32mok${ESC}[0m`)
  })

  // NO_COLOR and a pipe both land here. Escape codes in a redirected file are
  // noise a reader then has to strip.
  it('returns the text untouched when colour is off', () => {
    expect(paint('dim', 'x', plain)).toBe('x')
    expect(paint('green', 'ok', plain)).toBe('ok')
  })

  it('leaves a name it does not know alone rather than emitting junk', () => {
    expect(paint('chartreuse', 'x', colour)).toBe('x')
  })
})

describe('syntaxHelp', () => {
  // Ten lines to ask a question usually answered with Enter was a third of an
  // 80x24 screen. Two rows, wrapped to the width it was given.
  it('folds the list into rows that fit the terminal', () => {
    const rows = syntaxHelp(['plaintext', 'json', 'yaml', 'xml', 'sql'], 24, plain)
    expect(rows.length).toBeGreaterThan(1)
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(24)
  })

  it('names every syntax exactly once', () => {
    const list = ['plaintext', 'json', 'yaml', 'xml', 'sql', 'markdown']
    const joined = syntaxHelp(list, 80, plain).join(' ')
    for (const s of list) expect(joined).toContain(s)
  })

  it('keeps one row when the terminal is wide', () => {
    expect(syntaxHelp(['json', 'sql'], 200, plain)).toHaveLength(1)
  })

  // A very narrow terminal must still emit something, not loop or drop names.
  it('survives a terminal narrower than a single name', () => {
    const rows = syntaxHelp(['javascript'], 4, plain)
    expect(rows.join(' ')).toContain('javascript')
  })
})

describe('handoffText', () => {
  const draft = { name: 'Deploy notes', language: 'sql', content: 'a\nb', tags: ['cli'] }

  // "Saved" would be a lie: another process does the saving, and the lock this
  // one hands through is one-way.
  it('reports the hand-off, never a save it cannot know happened', () => {
    const text = handoffText(draft, plain)
    expect(text).toContain('Handed to Diff Bro')
    expect(text).not.toMatch(/saved/i)
  })

  it('names what it resolved, so nothing has to be looked up in the app', () => {
    const text = handoffText(draft, plain)
    expect(text).toContain('Deploy notes')
    expect(text).toContain('sql')
    expect(text).toContain('2 lines')
    expect(text).toContain('cli')
  })

  it('counts one line as one line', () => {
    expect(handoffText({ ...draft, content: 'only' }, plain)).toContain('1 line')
  })

  it('says the syntax was detected when nobody chose it', () => {
    expect(handoffText({ ...draft, language: 'auto' }, plain)).toMatch(/detected/)
  })

  it('lists every tag, not just the first', () => {
    const text = handoffText({ ...draft, tags: ['cli', 'db', 'ops'] }, plain)
    for (const tag of ['cli', 'db', 'ops']) expect(text).toContain(tag)
  })

  // An unnamed snippet is named by the store, which this process cannot ask.
  it('says so rather than printing an empty name', () => {
    expect(handoffText({ ...draft, name: '' }, plain)).toMatch(/unnamed/i)
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
