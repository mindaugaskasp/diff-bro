import { describe, expect, it } from 'vitest'
import { releaseVerdict } from '../../scripts/lib/releaseVerified.mjs'

const green = (...names) => names.map((name) => ({ name, conclusion: 'success' }))
const FULL = green(
  'quick',
  'check (ubuntu-latest)',
  'check (windows-latest)',
  'packaged',
  'e2e-build',
  'e2e (1)',
  'e2e (2)'
)

describe('releaseVerdict', () => {
  it('reuses CI that passed every job on the tagged commit', () => {
    expect(releaseVerdict(FULL).verified).toBe(true)
  })

  it('retests when any job failed, was skipped, cancelled or never finished', () => {
    for (const conclusion of ['failure', 'skipped', 'cancelled', null]) {
      expect(releaseVerdict([...FULL, { name: 'e2e (3)', conclusion }]).verified).toBe(false)
    }
  })

  it('retests a commit CI never fully ran on, such as a direct push', () => {
    expect(releaseVerdict([]).verified).toBe(false)
    expect(releaseVerdict(FULL.filter((r) => !r.name.startsWith('e2e'))).verified).toBe(false)
    expect(releaseVerdict(FULL.filter((r) => r.name !== 'check (windows-latest)')).verified).toBe(
      false
    )
  })

  it('retests when the packaged-app job is missing, so a broken package is never reused', () => {
    expect(releaseVerdict(FULL.filter((r) => r.name !== 'packaged')).verified).toBe(false)
  })

  it('ignores check runs from other workflows', () => {
    expect(releaseVerdict([...FULL, { name: 'CodeQL', conclusion: 'neutral' }]).verified).toBe(true)
  })
})
