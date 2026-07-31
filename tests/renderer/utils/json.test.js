import { describe, it, expect } from 'vitest'
import { sortDeep, stringifyJson, jsonPath } from '../../../src/renderer/src/utils/json'

// A deliberately messy, real-world payload: JSON-inside-JSON (a log line), XML
// and HTML held as string values, unicode, a big number, empties, and keys with
// dots and spaces.
const DATA = {
  id: 1,
  name: 'Ünîcødé ☃ "quoted" \\slash\\',
  active: true,
  ratio: 3.14159,
  big: 9007199254740991,
  nothing: null,
  empty: {},
  list: [],
  tags: ['b', 'a', 'c'],
  payload: '{"nested":{"x":1,"y":[2,3]},"ok":true}',
  xml: '<note type="reminder"><to>Tove</to><from>Jani</from></note>',
  html: '<div class="x">a &amp; b</div>',
  items: [
    { id: 10, name: 'alpha' },
    { id: 20, name: 'beta', meta: { id: 21 } }
  ],
  'weird.key': 'has a dot',
  'a b': 'space key'
}

describe('stringifyJson', () => {
  it('round-trips every shape without touching string contents', () => {
    for (const mode of ['pretty', 'minify', 'sort']) {
      expect(JSON.parse(stringifyJson(DATA, mode))).toEqual(DATA)
    }
  })

  it('never re-parses a string that happens to hold JSON or XML', () => {
    const out = JSON.parse(stringifyJson(DATA, 'pretty'))
    expect(out.payload).toBe(DATA.payload) // stays the exact JSON string
    expect(out.xml).toBe(DATA.xml) // stays the exact XML string
    expect(typeof out.payload).toBe('string')
  })

  it('minify has no whitespace; pretty is indented', () => {
    expect(stringifyJson(DATA, 'minify')).not.toMatch(/\n|\s{2}/)
    expect(stringifyJson(DATA, 'pretty')).toContain('\n  ')
  })

  it('preserves unicode, escapes and a max-safe integer', () => {
    const out = JSON.parse(stringifyJson(DATA))
    expect(out.name).toBe('Ünîcødé ☃ "quoted" \\slash\\')
    expect(out.big).toBe(9007199254740991)
  })
})

describe('sortDeep', () => {
  it('sorts object keys recursively but leaves values and array order alone', () => {
    const s = sortDeep(DATA)
    expect(Object.keys(s)).toEqual([...Object.keys(DATA)].sort())
    expect(Object.keys(s.items[1])).toEqual(['id', 'meta', 'name']) // nested sorted
    expect(s.tags).toEqual(['b', 'a', 'c']) // array order untouched
    expect(s.payload).toBe(DATA.payload) // JSON-in-string untouched
  })
})

describe('jsonPath', () => {
  const at = (p) => jsonPath(DATA, p).matches

  it('walks child keys, indices and the root', () => {
    expect(at('$.name')).toEqual([DATA.name])
    expect(at('name')).toEqual([DATA.name]) // leading $ optional
    expect(at('$.items[1].name')).toEqual(['beta'])
    expect(at('$')).toEqual([DATA])
  })

  it('handles wildcards on arrays and objects', () => {
    expect(at('$.items[*].id')).toEqual([10, 20])
    expect(at('$.tags[*]')).toEqual(['b', 'a', 'c'])
    expect(at('$.items.*')).toEqual(DATA.items)
  })

  it('does recursive descent, gathering a key from every depth', () => {
    expect(at('$..id')).toEqual([1, 10, 20, 21])
  })

  it('reads a key that contains a dot via bracket notation', () => {
    expect(at("$['weird.key']")).toEqual(['has a dot'])
    expect(at('$["a b"]')).toEqual(['space key'])
  })

  it('does not dive into a string that merely looks like JSON', () => {
    expect(at('$.payload')).toEqual([DATA.payload]) // the string itself
    expect(at('$.payload.nested')).toEqual([]) // not re-parsed → no child
  })

  it('returns no matches for a missing key or out-of-range index', () => {
    expect(at('$.missing')).toEqual([])
    expect(at('$.items[9]')).toEqual([])
  })

  it('reports an unsupported path', () => {
    expect(jsonPath(DATA, '$[bad').error).toBeTruthy()
  })
})
