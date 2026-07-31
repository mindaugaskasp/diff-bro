import { describe, expect, it } from 'vitest'
import {
  clipboardFilePaths,
  pathsFromBinaryPlist,
  pathsFromHdrop,
  pathsFromPlist,
  pathsFromUriList
} from '../../src/main/clipboardFiles'

// Explorer copies files as CF_HDROP: a 20-byte DROPFILES header (offset, POINT,
// fNC, fWide) then a double-null-terminated list of paths.
function hdrop(paths, { wide = true, offset = 20 } = {}) {
  const head = Buffer.alloc(20)
  head.writeUInt32LE(offset, 0)
  head.writeUInt32LE(wide ? 1 : 0, 16)
  const list = paths.join('\0') + '\0\0'
  return Buffer.concat([head, Buffer.from(list, wide ? 'utf16le' : 'latin1')])
}

// Captured from a real macOS pasteboard (two files copied in Finder). Finder
// writes the legacy filenames type as a BINARY plist, and it is the only
// flavour that carries every copied file.
const MAC_BPLIST = Buffer.from(
  'YnBsaXN0MDCiAQJfEBcvdG1wL2NsaXBkaWFnL2FscGhhLnR4dF8QFi90bXAvY2xpcGRpYWcvYmV0YS50eHQICyUAAAAAAAABAQAAAAAAAAADAAAAAAAAAAAAAAAAAAAAPg==',
  'base64'
)

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

describe('macOS pasteboard, as it really arrives', () => {
  it('reads every path out of the binary plist Finder writes', () => {
    expect(pathsFromBinaryPlist(MAC_BPLIST)).toEqual([
      '/tmp/clipdiag/alpha.txt',
      '/tmp/clipdiag/beta.txt'
    ])
  })

  // macOS lists text/uri-list but hands back nothing for it, so stopping at the
  // first format that is merely PRESENT loses the files entirely.
  it('falls past a listed-but-empty flavour to the one holding the files', () => {
    const paths = clipboardFilePaths({
      formats: () => ['text/uri-list'],
      readText: () => '',
      readBuffer: (f) => (f === 'NSFilenamesPboardType' ? MAC_BPLIST : Buffer.alloc(0))
    })
    expect(paths).toEqual(['/tmp/clipdiag/alpha.txt', '/tmp/clipdiag/beta.txt'])
  })

  // availableFormats() never mentions NSFilenamesPboardType, so gating reads on
  // it means never reading the files at all.
  it('finds the files even when availableFormats reports nothing', () => {
    const paths = clipboardFilePaths({
      formats: () => [],
      readText: () => '',
      readBuffer: (f) => (f === 'NSFilenamesPboardType' ? MAC_BPLIST : Buffer.alloc(0))
    })
    expect(paths).toEqual(['/tmp/clipdiag/alpha.txt', '/tmp/clipdiag/beta.txt'])
  })

  it('handles a unicode path in the binary plist', () => {
    // 0x6F marks a UTF-16BE string; "/tmp/☃.txt" is 10 code units.
    const head = Buffer.from('bplist00\xa1\x01\x6f\x10\x0a', 'binary')
    const body = Buffer.from('/tmp/☃.txt', 'utf16le').swap16()
    expect(pathsFromBinaryPlist(Buffer.concat([head, body]))).toEqual(['/tmp/☃.txt'])
  })
})

describe('Windows pasteboard', () => {
  const PATHS = ['C:\\Users\\me\\alpha.txt', 'C:\\Users\\me\\beta.txt']

  it('reads every path out of a wide CF_HDROP', () => {
    expect(pathsFromHdrop(hdrop(PATHS))).toEqual(PATHS)
  })

  it('reads an ANSI CF_HDROP too', () => {
    expect(pathsFromHdrop(hdrop(PATHS, { wide: false }))).toEqual(PATHS)
  })

  it('handles a UNC path and a unicode filename', () => {
    const odd = ['\\\\server\\share\\a.txt', 'C:\\tmp\\☃.txt']
    expect(pathsFromHdrop(hdrop(odd))).toEqual(odd)
  })

  it('refuses a truncated or nonsense buffer instead of inventing paths', () => {
    expect(pathsFromHdrop(Buffer.alloc(8))).toEqual([])
    expect(pathsFromHdrop(hdrop(PATHS, { offset: 9999 }))).toEqual([])
    expect(pathsFromHdrop(null)).toEqual([])
  })

  it('is preferred over the single-path FileNameW fallback', () => {
    const paths = clipboardFilePaths({
      formats: () => [],
      readText: () => '',
      readBuffer: (f) =>
        f === 'CF_HDROP'
          ? hdrop(PATHS)
          : f === 'FileNameW'
            ? Buffer.from('C:\\only.txt\0', 'utf16le')
            : Buffer.alloc(0)
    })
    expect(paths).toEqual(PATHS)
  })
})

// Newer Chromium exposes CF_HDROP as text/uri-list; Electron serves some
// flavours only through read(), not readBuffer(), so both are tried.
describe('a flavour served as text rather than a buffer', () => {
  it('still finds the files', () => {
    const paths = clipboardFilePaths({
      formats: () => ['text/uri-list'],
      readText: (f) => (f === 'text/uri-list' ? 'file:///C:/Users/me/a.txt\r\n' : ''),
      readBuffer: () => Buffer.alloc(0)
    })
    expect(paths).toEqual(['C:/Users/me/a.txt']) // not '/C:/...', which cannot be opened
  })
})

describe('windows file URLs', () => {
  it('drops the leading slash so the drive letter leads', () => {
    expect(pathsFromUriList('file:///C:/tmp/a.txt')).toEqual(['C:/tmp/a.txt'])
  })

  it('leaves posix paths alone', () => {
    expect(pathsFromUriList('file:///tmp/a.txt')).toEqual(['/tmp/a.txt'])
  })
})
