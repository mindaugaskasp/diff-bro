import { describe, expect, it } from 'vitest'
import {
  fileFlavours,
  filenamesPlist,
  gnomeCopiedFiles,
  hdrop,
  uriList
} from '../../src/main/clipboardWrite'
import {
  pathsFromHdrop,
  pathsFromPlist,
  pathsFromUriList
} from '../../src/main/clipboardFiles'

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

describe('fileFlavours', () => {
  it('writes the two macOS flavours on darwin', () => {
    expect(fileFlavours(['/tmp/a.txt'], 'darwin').map((f) => f.format)).toEqual([
      'NSFilenamesPboardType',
      'public.file-url'
    ])
  })

  it('writes CF_HDROP on win32', () => {
    expect(fileFlavours(['C:\\a.txt'], 'win32').map((f) => f.format)).toEqual(['CF_HDROP'])
  })

  it('writes both freedesktop flavours elsewhere', () => {
    expect(fileFlavours(['/tmp/a.txt'], 'linux').map((f) => f.format)).toEqual([
      'text/uri-list',
      'x-special/gnome-copied-files'
    ])
  })

  it('returns nothing for an empty or junk list rather than an empty flavour', () => {
    expect(fileFlavours([], 'darwin')).toEqual([])
    expect(fileFlavours([null, '', undefined], 'darwin')).toEqual([])
    expect(fileFlavours(undefined, 'darwin')).toEqual([])
  })
})
