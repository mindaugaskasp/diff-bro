// The name prompt completes against the library the editor completes against.
// The CLI process has no store — it runs before the single-instance lock — so
// the candidates come from the store file, and the rules come from the same
// module the editor's ghost text uses.
import { describe, expect, it } from 'vitest'
import { nameCompleter, namesFrom } from '../../src/main/cliNames'

const store = (entries) => JSON.stringify({ tags: {}, entries })

describe('namesFrom', () => {
  it('reads the names out of the store file', () => {
    expect(namesFrom(store([{ name: 'Deploy — prod' }, { name: 'Sendbird stuff' }]))).toEqual([
      'Deploy — prod',
      'Sendbird stuff'
    ])
  })

  // A secret's contents are the guarantee, but its NAME says what it is — and
  // the editor already refuses to offer one.
  it('never offers a secret snippet', () => {
    const names = namesFrom(store([{ name: 'Staging DB password', secret: true }, { name: 'Ok' }]))
    expect(names).toEqual(['Ok'])
  })

  it('survives a missing, empty or corrupt store', () => {
    for (const raw of [null, undefined, '', 'not json', '{}', '[]']) {
      expect(namesFrom(raw)).toEqual([])
    }
  })
})

describe('nameCompleter', () => {
  const complete = nameCompleter(['Deploy — prod', 'Deploy — dev', 'Sendbird stuff'])

  // readline's contract: the hits, then the text they complete. It inserts
  // their common prefix and lists them when a second Tab asks.
  it('returns the matches and the line they complete', () => {
    expect(complete('Dep')).toEqual([['Deploy — prod', 'Deploy — dev'], 'Dep'])
    expect(complete('Sen')).toEqual([['Sendbird stuff'], 'Sen'])
  })

  it('matches without regard to case', () => {
    expect(complete('sendbird')).toEqual([['Sendbird stuff'], 'sendbird'])
  })

  it('offers nothing for an empty line or a name with no match', () => {
    expect(complete('')).toEqual([[], ''])
    expect(complete('zzz')).toEqual([[], 'zzz'])
  })
})
