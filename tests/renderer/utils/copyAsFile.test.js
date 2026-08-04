import { describe, expect, it } from 'vitest'
import { diffPatchFile, snippetFile } from '../../../src/renderer/src/utils/copyAsFile'

const textDiff = (over = {}) => ({
  ready: true,
  isStreamed: false,
  comparableKind: 'text',
  left: { name: 'config-v1.json' },
  right: { name: 'config-v2.json' },
  leftComparable: { text: 'a\nb\n' },
  rightComparable: { text: 'a\nc\n' },
  ...over
})

describe('diffPatchFile', () => {
  it('names the file after the left side and gives it .patch', () => {
    const file = diffPatchFile(textDiff())
    expect(file.name).toBe('config-v1.patch')
    expect(file.content).toContain('config-v1.json')
  })

  it('mirrors copyDiff guards so the pair cannot drift', () => {
    expect(diffPatchFile(textDiff({ ready: false })).error).toContain('Load two files')
    expect(diffPatchFile(textDiff({ isStreamed: true })).error).toBe('streamed')
    expect(diffPatchFile(textDiff({ comparableKind: 'spreadsheet' })).error).toContain(
      'text comparisons'
    )
  })

  it('says so when the sides are identical', () => {
    const same = textDiff({ rightComparable: { text: 'a\nb\n' } })
    expect(diffPatchFile(same).error).toContain('identical')
  })

  // The name becomes a filename in main, but it must not arrive as a path here.
  it('flattens a side name that looks like a path', () => {
    const file = diffPatchFile(textDiff({ left: { name: '../../etc/passwd' } }))
    expect(file.name).not.toContain('/')
    expect(file.name).not.toContain('..')
  })

  it('falls back when the side has no usable name', () => {
    expect(diffPatchFile(textDiff({ left: { name: '///' } })).name).toBe('diff.patch')
  })
})

describe('snippetFile', () => {
  it('names from the title with the language extension', () => {
    expect(snippetFile({ name: 'API notes', content: 'x', lang: 'markdown' }).name).toBe(
      'API-notes.md'
    )
    expect(snippetFile({ name: 'conf', content: 'x', lang: 'yaml' }).name).toBe('conf.yml')
  })

  it('uses the language id itself when it already is the extension', () => {
    expect(snippetFile({ name: 'a', content: 'x', lang: 'json' }).name).toBe('a.json')
    expect(snippetFile({ name: 'a', content: 'x', lang: 'sql' }).name).toBe('a.sql')
  })

  it('falls back to .txt with no language', () => {
    expect(snippetFile({ name: 'a', content: 'x' }).name).toBe('a.txt')
  })

  // A staged file is plaintext on disk, which is precisely what "secret"
  // promises not to do. Copy content still works — a text clipboard is volatile.
  it('refuses a secret snippet, and says why', () => {
    const res = snippetFile({ name: 'token', content: 'sk-live-x', secret: true })
    expect(res.content).toBeUndefined()
    expect(res.error).toContain("can't be copied as a file")
  })

  it('refuses an empty snippet and nothing at all', () => {
    expect(snippetFile({ name: 'a', content: '' }).error).toContain('empty')
    expect(snippetFile(null).error).toBeTruthy()
  })

  it('flattens a title that looks like a path', () => {
    expect(snippetFile({ name: '../../.ssh/config', content: 'x' }).name).not.toContain('/')
  })

  it('drops an extension already in the title rather than doubling it', () => {
    expect(snippetFile({ name: 'notes.md', content: 'x', lang: 'markdown' }).name).toBe('notes.md')
  })
})
