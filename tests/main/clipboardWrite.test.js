import { describe, expect, it } from 'vitest'
import {
  fileFlavours,
  fileGroupDescriptor,
  filenamesPlist,
  gnomeCopiedFiles,
  hdrop,
  uriList,
  windowsFileDropListCommand,
  WIN_CLIP_PATH_ENV
} from '../../src/main/clipboardWrite'
import { pathsFromHdrop, pathsFromPlist, pathsFromUriList } from '../../src/main/clipboardFiles'

// The readers are already trusted and tested, which makes them the right oracle:
// a flavour we build must decode back to the path we put in.
describe('clipboardWrite round-trips through clipboardFiles', () => {
  const paths = ['/Users/me/Diff Bro/3f9c1ab2.diffbro', '/tmp/plain.txt']

  it('NSFilenamesPboardType XML survives pathsFromPlist', () => {
    expect(pathsFromPlist(filenamesPlist(paths).toString('utf8'))).toEqual(paths)
  })

  it('CF_HDROP survives pathsFromHdrop', () => {
    const win = ['C:\\Users\\me\\3f9c1ab2.diffbro', 'C:\\tmp\\plain.txt']
    expect(pathsFromHdrop(hdrop(win))).toEqual(win)
  })

  it('uri-list survives pathsFromUriList', () => {
    expect(pathsFromUriList(uriList(paths))).toEqual(paths)
  })

  it('a name with a space, a hash and a question mark survives the URL round trip', () => {
    const odd = ['/tmp/why not? #1 (final).diffbro']
    expect(pathsFromUriList(uriList(odd))).toEqual(odd)
  })

  it('a non-ASCII name survives every flavour', () => {
    const lt = ['/tmp/Rūta ir Ąžuolas.diffbro']
    expect(pathsFromUriList(uriList(lt))).toEqual(lt)
    expect(pathsFromPlist(filenamesPlist(lt).toString('utf8'))).toEqual(lt)
  })
})

describe('filenamesPlist', () => {
  it('escapes XML so a crafted name cannot add an entry', () => {
    const xml = filenamesPlist(['/tmp/a</string><string>/etc/passwd']).toString('utf8')
    expect(pathsFromPlist(xml)).toEqual(['/tmp/a</string><string>/etc/passwd'])
  })
})

describe('hdrop', () => {
  it('declares the path list as wide and points past its own header', () => {
    const buf = hdrop(['C:\\a.txt'])
    expect(buf.readUInt32LE(0)).toBe(20)
    expect(buf.readUInt32LE(16)).toBe(1)
  })

  it('normalises forward slashes, since Explorer will not take them', () => {
    expect(pathsFromHdrop(hdrop(['C:/tmp/a.txt']))).toEqual(['C:\\tmp\\a.txt'])
  })

  it('double-null-terminates the list', () => {
    const buf = hdrop(['C:\\a.txt'])
    expect(buf.subarray(buf.length - 4).toString('ucs2')).toBe('\0\0')
  })
})

describe('gnomeCopiedFiles', () => {
  it('leads with the operation, or a paste into Files is ignored', () => {
    expect(gnomeCopiedFiles(['/tmp/a.txt']).split('\n')[0]).toBe('copy')
  })
})

// Offsets restated from the Win32 headers rather than imported from the code
// under test — a parser sharing the writer's constants would agree with it about
// a wrong layout.
describe('fileGroupDescriptor', () => {
  const FD_ATTRIBUTES = 0x04
  const FD_WRITESTIME = 0x20
  const FD_FILESIZE = 0x40
  const FILE_ATTRIBUTE_NORMAL = 0x80
  const DESCRIPTOR_BYTES = 592
  const NAME_OFFSET = 4 + 72 // past cItems, then past the fixed head of fgd[0]

  it('declares one item and sizes the record as FILEGROUPDESCRIPTORW does', () => {
    const buf = fileGroupDescriptor('note.txt', 5)
    expect(buf.readUInt32LE(0)).toBe(1)
    expect(buf.length).toBe(4 + DESCRIPTOR_BYTES)
  })

  it('flags the fields it actually fills, and no others', () => {
    const flags = fileGroupDescriptor('note.txt', 5).readUInt32LE(4)
    expect(flags & FD_FILESIZE).toBe(FD_FILESIZE)
    expect(flags & FD_ATTRIBUTES).toBe(FD_ATTRIBUTES)
    expect(flags & FD_WRITESTIME).toBe(FD_WRITESTIME)
  })

  it('carries the byte count as a 64-bit size split high/low', () => {
    const buf = fileGroupDescriptor('note.txt', 0x1_0000_002a)
    expect(buf.readUInt32LE(4 + 64)).toBe(1) // nFileSizeHigh
    expect(buf.readUInt32LE(4 + 68)).toBe(0x2a) // nFileSizeLow
    expect(buf.readUInt32LE(4 + 36)).toBe(FILE_ATTRIBUTE_NORMAL)
  })

  it('writes the name as NUL-terminated UTF-16, non-ASCII included', () => {
    const buf = fileGroupDescriptor('Rūta.txt', 3)
    const name = buf.subarray(NAME_OFFSET, NAME_OFFSET + 520).toString('ucs2')
    expect(name.split('\0')[0]).toBe('Rūta.txt')
  })

  it('truncates a name that would overrun cFileName rather than corrupting the record', () => {
    const buf = fileGroupDescriptor(`${'x'.repeat(400)}.txt`, 3)
    expect(buf.length).toBe(4 + DESCRIPTOR_BYTES)
    const name = buf.subarray(NAME_OFFSET, NAME_OFFSET + 520).toString('ucs2')
    expect(name.split('\0')[0].length).toBeLessThanOrEqual(259)
  })
})

// The real Windows write path: Electron cannot put a shell-paste-able file on the
// clipboard, so copyPathToClipboard shells out to this. The path must NEVER be in
// the command — an injection there would run arbitrary PowerShell.
describe('windowsFileDropListCommand', () => {
  const decode = () => {
    const { command, args } = windowsFileDropListCommand()
    const i = args.indexOf('-EncodedCommand')
    const script = Buffer.from(args[i + 1], 'base64').toString('utf16le')
    return { command, args, script }
  }

  it('invokes powershell in a single-threaded apartment with no profile', () => {
    const { command, args } = decode()
    expect(command).toBe('powershell.exe')
    expect(args).toContain('-NoProfile')
    expect(args).toContain('-NonInteractive')
    expect(args).toContain('-STA')
  })

  it('writes a real file-drop list via SetFileDropList', () => {
    expect(decode().script).toContain('SetFileDropList')
  })

  it('reads the path from the environment, never from the command string', () => {
    const { script } = decode()
    expect(script).toContain(`$env:${WIN_CLIP_PATH_ENV}`)
    // No filesystem path is baked in — the only variable is the env reference.
    expect(script).not.toMatch(/[A-Za-z]:\\/)
    expect(script).not.toContain('/')
  })
})

describe('fileFlavours', () => {
  const bytes = Buffer.from('hello')

  it('writes the two macOS flavours on darwin', () => {
    expect(
      fileFlavours({ paths: ['/tmp/a.txt'], platform: 'darwin', bytes }).map((f) => f.format)
    ).toEqual(['NSFilenamesPboardType', 'public.file-url'])
  })

  // win32's fileFlavours is the canWriteFile support probe and the documented
  // layout — NOT the write path. Electron cannot put these on the clipboard
  // (each writeBuffer replaces it), so the real copy goes through
  // windowsFileDropListCommand → PowerShell SetFileDropList. These assertions
  // keep the reference layout honest.
  it('describes the descriptor flavours on win32', () => {
    const formats = fileFlavours({ paths: ['C:\\a.txt'], platform: 'win32', bytes }).map(
      (f) => f.format
    )
    expect(formats).toContain('FileGroupDescriptorW')
    expect(formats).toContain('FileContents')
    expect(formats).toContain('Preferred DropEffect')
  })

  it('puts the file’s own bytes in FileContents', () => {
    const flavours = fileFlavours({ paths: ['C:\\a.txt'], platform: 'win32', bytes })
    const contents = flavours.find((f) => f.format === 'FileContents')
    expect(contents.buffer.equals(bytes)).toBe(true)
  })

  it('names the descriptor after the staged file, not its full path', () => {
    const flavours = fileFlavours({
      paths: ['C:\\Users\\me\\c-ab12\\report.md'],
      platform: 'win32',
      bytes
    })
    const descriptor = flavours.find((f) => f.format === 'FileGroupDescriptorW')
    expect(descriptor.buffer.subarray(76, 596).toString('ucs2').split('\0')[0]).toBe('report.md')
  })

  it('asks for a copy, never a move, so the staged original is left to expire', () => {
    const effect = fileFlavours({ paths: ['C:\\a.txt'], platform: 'win32', bytes }).find(
      (f) => f.format === 'Preferred DropEffect'
    )
    expect(effect.buffer.readUInt32LE(0)).toBe(1) // DROPEFFECT_COPY
  })

  // Part of the reference layout only; the win32 write path is PowerShell, which
  // produces the genuine predefined CF_HDROP the shell reads.
  it('includes a valid custom CF_HDROP buffer in the reference set', () => {
    const flavours = fileFlavours({ paths: ['C:\\a.txt'], platform: 'win32', bytes })
    const own = flavours.find((f) => f.format === 'CF_HDROP')
    expect(pathsFromHdrop(own.buffer)).toEqual(['C:\\a.txt'])
  })

  it('writes both freedesktop flavours elsewhere', () => {
    expect(
      fileFlavours({ paths: ['/tmp/a.txt'], platform: 'linux', bytes }).map((f) => f.format)
    ).toEqual(['text/uri-list', 'x-special/gnome-copied-files'])
  })

  it('returns nothing for an empty or junk list rather than an empty flavour', () => {
    expect(fileFlavours({ paths: [], platform: 'darwin', bytes })).toEqual([])
    expect(fileFlavours({ paths: [null, '', undefined], platform: 'darwin', bytes })).toEqual([])
    expect(fileFlavours({ paths: undefined, platform: 'darwin', bytes })).toEqual([])
  })

  // canWriteFile asks whether the platform is supported at all, with no bytes in
  // hand, and must still get a truthful answer.
  it('still answers the support question without any bytes', () => {
    expect(fileFlavours({ paths: ['/x'], platform: 'win32' }).length).toBeGreaterThan(0)
    expect(fileFlavours({ paths: ['/x'], platform: 'sunos5' })).toEqual([])
  })
})
