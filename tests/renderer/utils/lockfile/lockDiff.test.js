import { describe, expect, it } from 'vitest'
import { diffLocks, semverStep } from '../../../../src/renderer/src/utils/lockfile/lockDiff'

const pkg = (name, version, extra = {}) => ({
  name,
  version,
  direct: false,
  dev: false,
  license: '',
  resolved: '',
  ...extra
})
const lock = (packages, extra = {}) => ({
  kind: 'npm',
  packages,
  knowsDirect: true,
  truncated: false,
  ...extra
})
const byName = (rows) => Object.fromEntries(rows.map((r) => [r.name, r]))

describe('semverStep', () => {
  it('names the step between two versions', () => {
    expect(semverStep('1.2.3', '2.0.0')).toBe('major')
    expect(semverStep('1.2.3', '1.3.0')).toBe('minor')
    expect(semverStep('1.2.3', '1.2.4')).toBe('patch')
    expect(semverStep('1.2.3', '1.2.3')).toBe('same')
  })

  it('reads a downgrade as the step it went back', () => {
    expect(semverStep('2.0.0', '1.9.9')).toBe('major')
    expect(semverStep('1.3.0', '1.2.0')).toBe('minor')
  })

  // 0.x is where a minor bump is the breaking one, and a lockfile is full of it.
  it('treats a 0.x minor as the breaking step', () => {
    expect(semverStep('0.1.0', '0.2.0')).toBe('major')
    expect(semverStep('0.1.0', '0.1.1')).toBe('patch')
  })

  it('says nothing it cannot work out', () => {
    expect(semverStep('1.2.3', 'v1.2.4-beta.1+build')).toBe('patch')
    expect(semverStep('not-a-version', '1.0.0')).toBe('unknown')
    expect(semverStep('', '')).toBe('unknown')
  })
})

describe('diffLocks', () => {
  it('reports nothing when the two sides hold the same set', () => {
    const same = lock([pkg('vue', '3.4.21'), pkg('vitest', '4.1.10')])
    const result = diffLocks(same, same)
    expect(result.rows).toHaveLength(0)
    expect(result.stats).toEqual({ added: 0, removed: 0, bumped: 0, downgraded: 0 })
    expect(result.identical).toBe(true)
  })

  it('classifies added, removed, bumped and downgraded', () => {
    const left = lock([pkg('kept', '1.0.0'), pkg('gone', '2.0.0'), pkg('down', '3.1.0')])
    const right = lock([pkg('kept', '1.1.0'), pkg('fresh', '0.1.0'), pkg('down', '3.0.0')])
    const rows = byName(diffLocks(left, right).rows)
    expect(rows.kept.status).toBe('bumped')
    expect(rows.kept.from).toBe('1.0.0')
    expect(rows.kept.to).toBe('1.1.0')
    expect(rows.gone.status).toBe('removed')
    expect(rows.fresh.status).toBe('added')
    expect(rows.down.status).toBe('downgraded')
  })

  it('carries the semver step of a bump', () => {
    const left = lock([pkg('a', '1.0.0'), pkg('b', '1.0.0')])
    const right = lock([pkg('a', '2.0.0'), pkg('b', '1.0.1')])
    const rows = byName(diffLocks(left, right).rows)
    expect(rows.a.step).toBe('major')
    expect(rows.b.step).toBe('patch')
  })

  // The headline the whole view exists for: of everything that moved, how much
  // did I ask for?
  it('splits the count into what was asked for and what came along', () => {
    const left = lock([pkg('asked', '1.0.0', { direct: true }), pkg('carried', '1.0.0')])
    const right = lock([pkg('asked', '2.0.0', { direct: true }), pkg('carried', '1.1.0')])
    const result = diffLocks(left, right)
    expect(result.stats.bumped).toBe(2)
    expect(result.directCount).toBe(1)
    expect(byName(result.rows).asked.direct).toBe(true)
    expect(byName(result.rows).carried.direct).toBe(false)
  })

  // A package can be installed at two versions at once. Reporting "bumped" for
  // that would invent a move that never happened.
  it('handles a package installed at two versions on one side', () => {
    const left = lock([pkg('dup', '1.0.0'), pkg('dup', '2.0.0')])
    const right = lock([pkg('dup', '2.0.0')])
    const rows = diffLocks(left, right).rows.filter((r) => r.name === 'dup')
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('removed')
    expect(rows[0].from).toBe('1.0.0')
  })

  it('reports a version arriving beside one that stays as added', () => {
    const left = lock([pkg('dup', '1.0.0')])
    const right = lock([pkg('dup', '1.0.0'), pkg('dup', '2.0.0')])
    const rows = diffLocks(left, right).rows.filter((r) => r.name === 'dup')
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('added')
    expect(rows[0].to).toBe('2.0.0')
  })

  it('sorts what the reader asked for above what came along', () => {
    const left = lock([pkg('zzz', '1.0.0', { direct: true }), pkg('aaa', '1.0.0')])
    const right = lock([pkg('zzz', '2.0.0', { direct: true }), pkg('aaa', '2.0.0')])
    expect(diffLocks(left, right).rows.map((r) => r.name)).toEqual(['zzz', 'aaa'])
  })

  it('says when neither side could tell direct from transitive', () => {
    const l = lock([pkg('a', '1.0.0')], { knowsDirect: false })
    const r = lock([pkg('a', '2.0.0')], { knowsDirect: false })
    expect(diffLocks(l, r).knowsDirect).toBe(false)
    expect(diffLocks(l, r).directCount).toBe(0)
  })

  it('carries dev and licence through to the row', () => {
    const left = lock([pkg('a', '1.0.0', { dev: true, license: 'MIT' })])
    const right = lock([pkg('a', '2.0.0', { dev: true, license: 'Apache-2.0' })])
    const row = diffLocks(left, right).rows[0]
    expect(row.dev).toBe(true)
    expect(row.license).toBe('Apache-2.0')
    expect(row.licenseChanged).toBe(true)
  })

  it('survives a side with nothing in it', () => {
    const result = diffLocks(lock([]), lock([pkg('a', '1.0.0')]))
    expect(result.stats.added).toBe(1)
  })
})
