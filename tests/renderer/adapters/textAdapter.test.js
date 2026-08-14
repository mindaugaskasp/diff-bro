import { describe, expect, it } from 'vitest'
import { textAdapter } from '../../../src/renderer/src/adapters/textAdapter'
import { resolveAdapter } from '../../../src/renderer/src/adapters'

describe('textAdapter', () => {
  it('is the fallback for every file', () => {
    expect(resolveAdapter({ name: 'anything.xyz' })).toBe(textAdapter)
  })

  it('maps known extensions to Monaco languages', () => {
    expect(textAdapter.toComparable({ name: 'a.ts', content: '' }).language).toBe('typescript')
    expect(textAdapter.toComparable({ name: 'b.py', content: '' }).language).toBe('python')
    expect(textAdapter.toComparable({ name: 'c.tar.json', content: '' }).language).toBe('json')
  })

  it('falls back to plaintext for unknown or missing extensions', () => {
    expect(textAdapter.toComparable({ name: 'noext', content: '' }).language).toBe('plaintext')
    expect(textAdapter.toComparable({ name: 'weird.zzz', content: '' }).language).toBe('plaintext')
  })

  it('passes content through untouched', () => {
    const out = textAdapter.toComparable({ name: 'a.js', content: 'const x = 1' })
    expect(out).toEqual({ kind: 'text', text: 'const x = 1', language: 'javascript' })
  })

  it('sniffs content when the extension is unknown or absent', () => {
    // Extensionless files that developers diff all the time.
    expect(
      textAdapter.toComparable({ name: 'Dockerfile', content: 'FROM node:20\nRUN npm ci' }).language
    ).toBe('dockerfile')
    // Pasted text arrives with a synthetic name that has no real extension.
    expect(textAdapter.toComparable({ name: 'Left (pasted)', content: '{"a": 1}' }).language).toBe(
      'json'
    )
    expect(
      textAdapter.toComparable({ name: 'script', content: '#!/bin/bash\necho hi' }).language
    ).toBe('shell')
  })

  it('lets a known extension win over content sniffing', () => {
    // A .txt holding JSON stays plaintext — the extension is the author's intent.
    expect(textAdapter.toComparable({ name: 'notes.md', content: '{"a": 1}' }).language).toBe(
      'markdown'
    )
  })

  it('tolerates missing content', () => {
    expect(textAdapter.toComparable({ name: 'noext' }).language).toBe('plaintext')
  })
})

// A .har is JSON by spec, but it is JSON whose string values hold whole captured
// HTML responses. Sniffing only sees the first 50k, which cuts a multi-MB
// capture into unparseable JSON, and the `<div`/`<script` inside those bodies
// then hands the file to the HTML detector. Monaco parses the WHOLE file as
// HTML, every unclosed tag nests the next, and its symbol walk recurses until
// the stack goes.
describe('a HAR capture is JSON, not the HTML it carries', () => {
  const harOverDetectLimit = () => {
    const entry = (i) =>
      JSON.stringify({
        request: { url: `https://example.test/page/${i}` },
        response: {
          content: {
            mimeType: 'text/html',
            text: `<html><body><div class="a"><span>row ${i}</span><script src="x.js">`
          }
        }
      })
    const entries = Array.from({ length: 400 }, (_, i) => entry(i)).join(',')
    return `{"log":{"version":"1.2","entries":[${entries}]}}`
  }

  it('reads a .har as json from its extension', () => {
    const har = harOverDetectLimit()
    expect(har.length).toBeGreaterThan(50_000)
    expect(textAdapter.toComparable({ name: 'session.har', content: har }).language).toBe('json')
  })

  it('does not call JSON-shaped text HTML even when the sniff window is cut short', () => {
    // No extension to lean on — the content is all there is to go on.
    const language = textAdapter.toComparable({
      name: 'capture',
      content: harOverDetectLimit()
    }).language
    expect(language).not.toBe('html')
  })
})
