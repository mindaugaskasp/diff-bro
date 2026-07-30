import { describe, expect, it } from 'vitest'
import { parseXml, stringifyXml, xpath } from '../../../src/renderer/src/utils/xml'

// A messy but realistic document: attributes, nested elements, repeated
// siblings, mixed content, an entity, CDATA, and a namespace prefix.
const DOC = `<?xml version="1.0"?>
<catalog xmlns:dc="http://purl.org/dc/elements/1.1/" count="3">
  <book id="b1" lang="en">
    <title>Dune</title>
    <year>1965</year>
    <dc:creator>Frank Herbert</dc:creator>
  </book>
  <book id="b2" lang="en">
    <title>Neuromancer &amp; other stories</title>
    <year>1984</year>
  </book>
  <book id="b3" lang="lt">
    <title><![CDATA[Raw <not a tag> text]]></title>
    <year>2001</year>
  </book>
</catalog>`

const root = () => {
  const parsed = parseXml(DOC)
  expect(parsed.root).toBeDefined()
  return parsed.root
}

describe('parseXml', () => {
  it('builds a tree of elements, attributes and text', () => {
    const r = root()
    expect(r.name).toBe('catalog')
    expect(r.attrs).toContainEqual(['count', '3'])
    expect(r.children).toHaveLength(3)
    expect(r.children[0].attrs).toEqual([
      ['id', 'b1'],
      ['lang', 'en']
    ])
    expect(r.children[0].children.map((c) => c.name)).toEqual(['title', 'year', 'dc:creator'])
  })

  it('decodes entities and keeps CDATA as literal text', () => {
    const books = root().children
    expect(books[1].children[0].text).toBe('Neuromancer & other stories')
    expect(books[2].children[0].text).toBe('Raw <not a tag> text')
  })

  it('keeps a namespace prefix in the element name', () => {
    expect(root().children[0].children[2].name).toBe('dc:creator')
  })

  it('reports a mismatched tag with its location instead of throwing', () => {
    const bad = parseXml('<a>\n  <b></c>\n</a>')
    expect(bad.root).toBeUndefined()
    expect(bad.error).toBeTruthy()
    expect(bad.line).toBeGreaterThan(0)
  })

  it('reports empty input', () => {
    expect(parseXml('   ').error).toBeTruthy()
  })
})

describe('stringifyXml', () => {
  it('pretty-prints with indentation', () => {
    const out = stringifyXml('<a><b>1</b></a>')
    expect(out).toContain('\n')
    expect(out.split('\n')[1]).toMatch(/^\s+<b>/)
  })

  it('minifies away the whitespace between tags without touching text', () => {
    const out = stringifyXml('<a>\n  <b>hello world</b>\n</a>', 'minify')
    expect(out).toBe('<a><b>hello world</b></a>')
  })

  it('is empty for empty input', () => {
    expect(stringifyXml('  ')).toBe('')
  })
})

describe('xpath', () => {
  const names = (r) => r.matches.map((m) => (typeof m === 'string' ? m : m.name))

  it('returns the root for an empty path', () => {
    expect(names(xpath(root(), ''))).toEqual(['catalog'])
  })

  it('walks absolute child steps', () => {
    expect(xpath(root(), '/catalog/book').matches).toHaveLength(3)
    expect(names(xpath(root(), '/catalog/book/title'))).toEqual(['title', 'title', 'title'])
  })

  it('finds descendants at any depth', () => {
    expect(xpath(root(), '//title').matches).toHaveLength(3)
    expect(xpath(root(), '//year').matches).toHaveLength(3)
  })

  it('indexes are 1-based, matching XPath', () => {
    const first = xpath(root(), '//book[1]/title')
    expect(first.matches).toHaveLength(1)
    expect(first.matches[0].text).toBe('Dune')
    expect(xpath(root(), '//book[3]/year').matches[0].text).toBe('2001')
    expect(xpath(root(), '//book[9]').matches).toEqual([])
  })

  it('selects attribute values with @', () => {
    expect(xpath(root(), '//book/@id').matches).toEqual(['b1', 'b2', 'b3'])
    expect(xpath(root(), '/catalog/@count').matches).toEqual(['3'])
  })

  it('matches any element with *', () => {
    expect(xpath(root(), '/catalog/*').matches).toHaveLength(3)
    expect(names(xpath(root(), '//book[1]/*'))).toEqual(['title', 'year', 'dc:creator'])
  })

  it('returns nothing when the root name does not match', () => {
    expect(xpath(root(), '/nope/book').matches).toEqual([])
  })

  it('cannot step past an attribute value', () => {
    expect(xpath(root(), '//book/@id/title').matches).toEqual([])
  })

  it('reports an unsupported path instead of guessing', () => {
    expect(xpath(root(), '/cat//[[').error).toBeTruthy()
  })
})
