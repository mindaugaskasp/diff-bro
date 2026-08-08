import { describe, expect, it } from 'vitest'
import { completionFor, indexableNames } from '../../../src/renderer/src/utils/nameComplete'

const DEPLOY = ['Deploy — prod', 'Deploy — staging', 'Deploy — dev']

describe('completionFor', () => {
  // The whole design: stop where the library stops agreeing, so a completion
  // never invents the part that tells two snippets apart.
  it('completes to the longest common prefix of every match', () => {
    expect(completionFor('Dep', DEPLOY)).toBe('loy — ')
  })

  it('completes the whole name when exactly one matches', () => {
    expect(completionFor('Deploy — s', DEPLOY)).toBe('taging')
  })

  it('offers nothing when nothing matches', () => {
    expect(completionFor('zzz', DEPLOY)).toBe('')
  })

  it('offers nothing for an empty or whitespace-only input', () => {
    expect(completionFor('', DEPLOY)).toBe('')
    expect(completionFor('   ', DEPLOY)).toBe('')
  })

  it('offers nothing once the typed text already IS a stored name', () => {
    expect(completionFor('Deploy — prod', DEPLOY)).toBe('')
  })

  it('matches case-insensitively but continues in the STORED casing', () => {
    expect(completionFor('dep', DEPLOY)).toBe('loy — ')
    expect(completionFor('DEPLOY — S', DEPLOY)).toBe('taging')
  })

  // expandTemplates owns that text; completing over a half-typed token would
  // produce a name the user never chose.
  it('refuses to complete a name carrying a template token', () => {
    expect(completionFor('Standup {{tod', ['Standup {{today}} notes'])).toBe('')
    expect(completionFor('{{', ['{{week}} review'])).toBe('')
  })

  it('survives an empty or missing library', () => {
    expect(completionFor('Dep', [])).toBe('')
    expect(completionFor('Dep', undefined)).toBe('')
  })

  it('ignores a stored name that only differs by surrounding space', () => {
    expect(completionFor('Dep', ['  Deploy — prod  ', 'Deploy — prod'])).toBe('loy — prod')
  })
})

describe('indexableNames', () => {
  const entries = [
    { name: 'Deploy — prod', secret: false },
    { name: 'Vault master key', secret: true },
    { name: '', secret: false },
    { name: 'Deploy — dev' }
  ]

  // A secret's guarantee is about its contents, but its NAME hints at what it
  // is — offering that inside an unrelated snippet leaks intent.
  it('leaves secret snippets out of the index', () => {
    expect(indexableNames(entries)).not.toContain('Vault master key')
  })

  it('keeps the ordinary names and drops the empty ones', () => {
    expect(indexableNames(entries)).toEqual(['Deploy — prod', 'Deploy — dev'])
  })

  it('de-duplicates, so one name cannot outvote itself', () => {
    expect(indexableNames([{ name: 'A' }, { name: 'A' }])).toEqual(['A'])
  })
})
