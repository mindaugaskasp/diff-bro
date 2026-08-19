import { describe, expect, it } from 'vitest'
import { decodeBuffer, decodeText } from '../../src/main/decodeText'

// Every file the app opens comes through here, so the encodings below are the
// ones a wrong answer would silently mangle rather than fail on.
const bytes = (...n) => Buffer.from(n)

describe('decodeBuffer', () => {
  it('decodes UTF-8', () => {
    expect(decodeBuffer(Buffer.from('héllo wörld', 'utf8'), 'UTF-8')).toEqual({
      content: 'héllo wörld',
      encoding: 'UTF-8'
    })
  })

  // A BOM left in the text shows up as a zero-width space at the head of the
  // first line and silently breaks a first-line comparison.
  it('strips a UTF-8 BOM', () => {
    const buf = Buffer.concat([bytes(0xef, 0xbb, 0xbf), Buffer.from('hello', 'utf8')])
    expect(decodeBuffer(buf, 'UTF-8').content).toBe('hello')
  })

  it('decodes UTF-16LE and strips its BOM', () => {
    const buf = Buffer.concat([bytes(0xff, 0xfe), Buffer.from('hello', 'utf16le')])
    expect(decodeBuffer(buf, 'UTF-16LE').content).toBe('hello')
  })

  it('decodes a single-byte legacy page', () => {
    // 0xE9 is é in windows-1252.
    expect(decodeBuffer(bytes(0x63, 0x61, 0x66, 0xe9), 'windows-1252').content).toBe('café')
  })

  it('decodes Cyrillic', () => {
    expect(decodeBuffer(bytes(0xf0, 0xf2, 0xe9, 0xf7, 0xe5, 0xf4), 'KOI8-R').content).toBe('ПРИВЕТ')
  })

  // The label is whatever chardet guessed; it is not a promise the platform
  // knows it. Falling back beats handing the reader an error for a file that
  // is mostly readable as UTF-8.
  it('falls back to UTF-8 for a label the platform refuses', () => {
    expect(decodeBuffer(Buffer.from('plain', 'utf8'), 'UTF-7')).toEqual({
      content: 'plain',
      encoding: 'UTF-8'
    })
    expect(decodeBuffer(Buffer.from('plain', 'utf8'), 'not-an-encoding').encoding).toBe('UTF-8')
  })

  it('falls back when no label was detected at all', () => {
    expect(decodeBuffer(Buffer.from('plain', 'utf8'), null).encoding).toBe('UTF-8')
  })

  it('survives an empty file', () => {
    expect(decodeBuffer(Buffer.alloc(0), 'UTF-8')).toEqual({ content: '', encoding: 'UTF-8' })
  })

  // Malformed bytes become U+FFFD rather than throwing — the file still opens.
  it('replaces undecodable bytes instead of throwing', () => {
    const out = decodeBuffer(bytes(0x68, 0x69, 0xff, 0xfe), 'UTF-8')
    expect(out.content).toContain('hi')
    expect(out.content).toContain('�')
  })
})

describe('decodeText', () => {
  it('detects and decodes without being told the encoding', () => {
    expect(decodeText(Buffer.from('héllo', 'utf8')).content).toBe('héllo')
  })

  it('reports the encoding it used', () => {
    expect(decodeText(Buffer.from('hello world, plain ascii', 'utf8')).encoding).toBeTruthy()
  })

  it('survives an empty file', () => {
    expect(decodeText(Buffer.alloc(0)).content).toBe('')
  })
})
