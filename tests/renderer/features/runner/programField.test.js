import { describe, expect, it } from 'vitest'
import {
  foundPrograms,
  hasProgramMenu,
  shownVersion,
  stopAfterFrom,
  typedPathToUse
} from '../../../../src/renderer/src/features/runner/programField'

const PYTHON = {
  enabled: true,
  path: '/usr/bin/python3',
  version: '3.11.2',
  stopAfterMinutes: 2,
  candidates: [
    { path: '/opt/homebrew/bin/python3', version: '3.13.0' },
    { path: '/usr/bin/python3', version: '3.11.2' }
  ]
}
const OFF = { enabled: false, path: null, version: null, stopAfterMinutes: 2, candidates: [] }

describe('typedPathToUse', () => {
  it('hands main a new path, trimmed', () => {
    expect(typedPathToUse('  /usr/local/bin/python3 ', PYTHON)).toBe('/usr/local/bin/python3')
  })

  it('sends nothing for an empty field or the program already in use', () => {
    expect(typedPathToUse('   ', PYTHON)).toBeNull()
    expect(typedPathToUse('/usr/bin/python3', PYTHON)).toBeNull()
  })

  it('sends a path for a language with nothing remembered', () => {
    expect(typedPathToUse('/bin/php', OFF)).toBe('/bin/php')
  })
})

describe('shownVersion', () => {
  it('shows the version while the field holds the program it belongs to', () => {
    expect(shownVersion('/usr/bin/python3', PYTHON)).toBe('3.11.2')
  })

  it('hides it once the field holds something else', () => {
    expect(shownVersion('/usr/bin/python', PYTHON)).toBeNull()
    expect(shownVersion('', OFF)).toBeNull()
  })
})

describe('the found-programs menu', () => {
  it('lists what main found, in its order, marking the one in use', () => {
    expect(foundPrograms(PYTHON)).toEqual([
      { index: 0, path: '/opt/homebrew/bin/python3', version: '3.13.0', isCurrent: false },
      { index: 1, path: '/usr/bin/python3', version: '3.11.2', isCurrent: true }
    ])
  })

  it('is there while the language is on, for Find again', () => {
    expect(hasProgramMenu({ ...PYTHON, candidates: [] })).toBe(true)
  })

  it('is there while off only when there is something to pick', () => {
    expect(hasProgramMenu(OFF)).toBe(false)
    expect(hasProgramMenu({ ...PYTHON, enabled: false })).toBe(true)
    expect(hasProgramMenu(null)).toBe(false)
  })
})

describe('stopAfterFrom', () => {
  it.each([
    ['2', 2],
    [' 15 ', 15],
    ['0', 0],
    ['1440', 1440]
  ])('reads %j as %j minutes', (text, minutes) => {
    expect(stopAfterFrom(text)).toBe(minutes)
  })

  it.each([[''], ['-1'], ['1.5'], ['2e1'], ['abc'], ['1441']])('turns down %j', (text) => {
    expect(stopAfterFrom(text)).toBeNull()
  })
})
