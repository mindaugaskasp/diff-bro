import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isEnabled,
  rendererStatus,
  readConfig,
  sanitizeConfig,
  withLanguage,
  writeConfig
} from '../../src/main/runnerConfig'

const OFF = { enabled: false, path: null, version: null }

describe('sanitizeConfig', () => {
  it('starts with every language off and nothing confirmed', () => {
    expect(sanitizeConfig(null)).toEqual({
      languages: { php: OFF, python: OFF },
      confirmed: false
    })
  })

  it('keeps a well-formed language', () => {
    const php = { enabled: true, path: '/bin/php', version: '8.3.6' }
    expect(sanitizeConfig({ languages: { php }, confirmed: true })).toEqual({
      languages: { php, python: OFF },
      confirmed: true
    })
  })

  // A hand-edited file must not enable anything by accident.
  it.each([
    [{ enabled: true }],
    [{ enabled: true, path: 42 }],
    [{ enabled: true, path: '' }],
    [{ enabled: 'yes', path: '/bin/php' }],
    ['nonsense']
  ])('leaves %j off', (php) => {
    expect(sanitizeConfig({ languages: { php } }).languages.php.enabled).toBe(false)
  })

  it('drops a language it cannot run', () => {
    const shell = { enabled: true, path: '/bin/sh' }
    expect(sanitizeConfig({ languages: { shell } }).languages.shell).toBeUndefined()
  })

  it('takes only a literal true as confirmed', () => {
    expect(sanitizeConfig({ confirmed: 'true' }).confirmed).toBe(false)
  })
})

describe('withLanguage', () => {
  it('changes one language and leaves the rest', () => {
    const next = withLanguage(sanitizeConfig(null), 'php', { enabled: true, path: '/bin/php' })
    expect(next.languages.php).toMatchObject({ enabled: true, path: '/bin/php' })
    expect(next.languages.python).toEqual(OFF)
  })
})

// Change… swaps the program of a language already on; it must never be the way one turns on.
describe('isEnabled', () => {
  it('answers for the language asked about', () => {
    const config = withLanguage(sanitizeConfig(null), 'php', { enabled: true, path: '/bin/php' })
    expect(isEnabled(config, 'php')).toBe(true)
    expect(isEnabled(config, 'python')).toBe(false)
  })
})

describe('rendererStatus', () => {
  it('shows the renderer each language, and not whether the warning was seen', () => {
    const status = rendererStatus(sanitizeConfig({ confirmed: true }))
    expect(status).toEqual({ php: { ...OFF, candidates: [] }, python: { ...OFF, candidates: [] } })
  })

  it('adds the programs main found for each language', () => {
    const found = [{ path: '/usr/bin/python3', version: '3.11.2' }]
    const status = rendererStatus(sanitizeConfig(null), { python: found })
    expect(status.python.candidates).toEqual(found)
    expect(status.php.candidates).toEqual([])
  })
})

describe('the file', () => {
  let dir
  let file
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'runner-config-'))
    file = join(dir, 'runners.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('round-trips', () => {
    const config = withLanguage(sanitizeConfig(null), 'python', {
      enabled: true,
      path: '/bin/python3',
      version: '3.12.1'
    })
    writeConfig(file, config)
    expect(readConfig(file)).toEqual(config)
    expect(JSON.parse(readFileSync(file, 'utf8')).languages.python.path).toBe('/bin/python3')
  })

  it('reads a missing or corrupt file as all off', () => {
    expect(readConfig(file).languages.php.enabled).toBe(false)
    writeFileSync(file, '{ not json')
    expect(readConfig(file).languages.php.enabled).toBe(false)
  })
})
