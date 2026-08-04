import { describe, expect, it } from 'vitest'
import { filterRecipients, sortRecipients } from '../../../src/renderer/src/utils/recipientSearch'

const keys = [
  { fingerprint: 'fp-tomas', label: 'Tomas — build box', email: 'tomas@example.com' },
  { fingerprint: 'fp-ana', label: 'Ana — work laptop', email: 'ana.petrauskas@example.com' },
  { fingerprint: 'fp-ci', label: 'Automation — CI signer', email: null },
  { fingerprint: 'fp-ruta', label: 'Rūta — design', email: 'ruta@example.com' },
  { fingerprint: 'fp-tom2', label: 'Zed — laptop', email: 'tom@example.net' }
]

const labels = (list) => list.map((k) => k.label)

describe('sortRecipients', () => {
  it('orders alphabetically, replacing insertion order', () => {
    expect(labels(sortRecipients(keys))).toEqual([
      'Ana — work laptop',
      'Automation — CI signer',
      'Rūta — design',
      'Tomas — build box',
      'Zed — laptop'
    ])
  })

  it('does not mutate its input', () => {
    const copy = [...keys]
    sortRecipients(keys)
    expect(keys).toEqual(copy)
  })

  it('survives an empty or missing list', () => {
    expect(sortRecipients([])).toEqual([])
    expect(sortRecipients(undefined)).toEqual([])
  })
})

describe('filterRecipients', () => {
  it('returns alphabetical order for an empty query', () => {
    expect(labels(filterRecipients(keys, { query: '' }))[0]).toBe('Ana — work laptop')
    expect(filterRecipients(keys)).toHaveLength(5)
  })

  // The band order rank() gives, which is the point of reusing it.
  it('ranks a label prefix above a label substring above an address match', () => {
    const found = filterRecipients(keys, { query: 'tom' })
    expect(labels(found)).toEqual([
      'Tomas — build box', // label prefix
      'Automation — CI signer', // label substring ("Automation")
      'Zed — laptop' // address substring (tom@example.net)
    ])
  })

  it('matches on the address', () => {
    expect(labels(filterRecipients(keys, { query: 'petrauskas' }))).toEqual(['Ana — work laptop'])
  })

  it('matches on the fingerprint', () => {
    expect(labels(filterRecipients(keys, { query: 'fp-ruta' }))).toEqual(['Rūta — design'])
  })

  it('is case-insensitive', () => {
    expect(labels(filterRecipients(keys, { query: 'ANA' }))).toContain('Ana — work laptop')
  })

  it('returns nothing for a query that matches nothing', () => {
    expect(filterRecipients(keys, { query: 'zzzz' })).toEqual([])
  })

  it('filters to keys with an address', () => {
    const found = filterRecipients(keys, { withEmailOnly: true })
    expect(labels(found)).not.toContain('Automation — CI signer')
    expect(found).toHaveLength(4)
  })

  it('combines the query and the address filter', () => {
    expect(labels(filterRecipients(keys, { query: 'tom', withEmailOnly: true }))).toEqual([
      'Tomas — build box',
      'Zed — laptop'
    ])
  })

  // The projection is for the scorer; a component that saw both `name` and
  // `label` would eventually read the wrong one.
  it('hands back the original shape, not the scorer projection', () => {
    const [first] = filterRecipients(keys, { query: 'ana' })
    expect(first).toEqual(keys[1])
    expect(first).not.toHaveProperty('name')
    expect(first).not.toHaveProperty('tags')
  })

  it('handles thirty keys without losing any', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      fingerprint: `fp-${i}`,
      label: `Person ${String(i).padStart(2, '0')}`,
      email: `p${i}@example.com`
    }))
    expect(filterRecipients(many)).toHaveLength(30)
    expect(filterRecipients(many, { query: 'Person 07' })).toHaveLength(1)
  })
})
