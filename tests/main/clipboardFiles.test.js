import { describe, expect, it } from 'vitest'
import { clipboardFilePaths, pathsFromPlist, pathsFromUriList } from '../../src/main/clipboardFiles'

const clip = ({ formats = [], text = '', buffers = {} }) => ({
  formats: () => formats,
  readText: () => text,
  readBuffer: (f) => Buffer.from(buffers[f] ?? '', buffers[`${f}:enc`] ?? 'utf8')
})

describe('pathsFromUriList', () => {
  it('reads one path per line', () => {
    expect(pathsFromUriList('file:///tmp/a.txt\r\nfile:///tmp/b.txt\r\n')).toEqual([
      '/tmp/a.txt',
      '/tmp/b.txt'
    ])
  })

  it('decodes percent-escapes, so spaces and unicode survive', () => {
    expect(pathsFromUriList('file:///tmp/my%20file%20%E2%98%83.txt')).toEqual([
      '/tmp/my file ☃.txt'
    ])
  })

  it('skips comment lines and blanks', () => {
    expect(pathsFromUriList('# comment\n\nfile:///tmp/a.txt\n')).toEqual(['/tmp/a.txt'])
  })

  // A copied hyperlink also lands as a uri-list; it must not become a "file".
  it('ignores anything that is not a local file URL', () => {
    expect(pathsFromUriList('https://example.com/a.txt\nfile://evil.host/tmp/a')).toEqual([])
  })

  it('handles empty and missing input', () => {
    expect(pathsFromUriList('')).toEqual([])
    expect(pathsFromUriList(undefined)).toEqual([])
  })
})

describe('pathsFromPlist', () => {
  it('pulls the paths out of the macOS plist', () => {
    const xml = `<?xml version="1.0"?><plist version="1.0"><array>
      <string>/Users/me/a.txt</string><string>/Users/me/b.txt</string></array></plist>`
    expect(pathsFromPlist(xml)).toEqual(['/Users/me/a.txt', '/Users/me/b.txt'])
  })

  it('unescapes XML entities in a path', () => {
    expect(pathsFromPlist('<string>/tmp/a &amp; b.txt</string>')).toEqual(['/tmp/a & b.txt'])
  })

  it('ignores relative or junk entries', () => {
    expect(pathsFromPlist('<string>not/absolute</string><string></string>')).toEqual([])
  })
})

describe('clipboardFilePaths', () => {
  it('prefers the uri-list flavour', () => {
    const paths = clipboardFilePaths(
      clip({
        formats: ['text/plain', 'text/uri-list'],
        buffers: { 'text/uri-list': 'file:///tmp/a.txt\nfile:///tmp/b.txt\n' }
      })
    )
    expect(paths).toEqual(['/tmp/a.txt', '/tmp/b.txt'])
  })

  it('falls back to the macOS plist', () => {
    const paths = clipboardFilePaths(
      clip({
        formats: ['NSFilenamesPboardType'],
        buffers: { NSFilenamesPboardType: '<string>/Users/me/a.txt</string>' }
      })
    )
    expect(paths).toEqual(['/Users/me/a.txt'])
  })

  it('reads a single macOS file URL', () => {
    expect(
      clipboardFilePaths(clip({ formats: ['public.file-url'], text: 'file:///tmp/a.txt' }))
    ).toEqual(['/tmp/a.txt'])
  })

  it('reads a single Windows path, trimming its UTF-16 terminator', () => {
    expect(
      clipboardFilePaths(
        clip({
          formats: ['FileNameW'],
          buffers: { FileNameW: 'C:\\tmp\\a.txt\0', 'FileNameW:enc': 'ucs2' }
        })
      )
    ).toEqual(['C:\\tmp\\a.txt'])
  })

  // Plain copied text must keep going to the paste flow, not become a file.
  it('is empty when the clipboard holds only text', () => {
    expect(clipboardFilePaths(clip({ formats: ['text/plain'], text: 'a.txt\nb.txt' }))).toEqual([])
    expect(clipboardFilePaths(clip({}))).toEqual([])
  })
})
