import { describe, expect, it } from 'vitest'
import {
  ACKNOWLEDGED,
  installedFromLock,
  staleAcknowledgements,
  unexpectedWarnings,
  warningLines
} from '../../scripts/lib/installWarnings.mjs'

// The allowlist only ever reported itself wrong during a RELEASE build — the one
// moment nobody wants to find out. These are the exact lines `npm ci` emitted on
// both runners for v0.4.10, copied from the failed run's log.
const V0410_LOG = `
npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it.
npm warn deprecated rimraf@2.6.3: Rimraf versions prior to v4 are no longer supported
npm warn deprecated glob@7.2.3: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version.
npm warn deprecated glob@10.5.0: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version.
added 1043 packages, and audited 1044 packages in 41s
`

describe('unexpectedWarnings', () => {
  // The regression: glob@10 arrived with the i18n lint plugin, and 'glob@7' does
  // not match it. v0.4.10 was the first release build after that plugin landed.
  it('accepts every warning the v0.4.10 install actually produced', () => {
    expect(unexpectedWarnings(V0410_LOG)).toEqual([])
  })

  it('still flags a deprecation nobody has reviewed', () => {
    const log = 'npm warn deprecated left-pad@1.0.0: nope'
    expect(unexpectedWarnings(log)).toHaveLength(1)
    expect(unexpectedWarnings(log)[0]).toContain('left-pad')
  })

  it('flags an engine mismatch, not only a deprecation', () => {
    const log =
      'npm warn EBADENGINE Unsupported engine { package: "x@1", required: { node: ">=24" } }'
    expect(unexpectedWarnings(log)).toHaveLength(1)
  })

  it('reads a Windows log, which is CRLF', () => {
    const crlf = V0410_LOG.replace(/\n/g, '\r\n')
    expect(unexpectedWarnings(crlf)).toEqual([])
    expect(warningLines(crlf)).toHaveLength(4)
  })

  it('says nothing about a clean install', () => {
    expect(unexpectedWarnings('added 1043 packages in 41s')).toEqual([])
    expect(warningLines('')).toEqual([])
    expect(unexpectedWarnings(null)).toEqual([])
  })
})

describe('ACKNOWLEDGED', () => {
  // A bare 'glob' would swallow every future glob deprecation, including one in
  // a dependency nobody has looked at. Each entry names a major.
  it('pins each glob entry to a major rather than the package name', () => {
    const globs = ACKNOWLEDGED.filter((e) => e.startsWith('glob'))
    expect(globs.length).toBeGreaterThan(0)
    for (const entry of globs) expect(entry).toMatch(/^glob@\d+$/)
  })

  it('does not acknowledge a package outright by bare name where a version exists', () => {
    expect(ACKNOWLEDGED).not.toContain('glob')
    expect(ACKNOWLEDGED).not.toContain('rimraf')
  })
})

describe('installedFromLock', () => {
  const lock = {
    packages: {
      '': { name: 'diffbro', version: '0.4.10' },
      'node_modules/glob': { version: '7.2.3' },
      'node_modules/a/node_modules/glob': { version: '10.5.0' },
      'node_modules/@scope/thing': { version: '2.0.0' },
      'node_modules/nover': {}
    }
  }

  it('keeps every copy of a package that appears more than once', () => {
    expect(installedFromLock(lock).get('glob')).toEqual(['7.2.3', '10.5.0'])
  })

  it('reads a scoped name whole, and skips the root and versionless entries', () => {
    const found = installedFromLock(lock)
    expect(found.get('@scope/thing')).toEqual(['2.0.0'])
    expect(found.has('diffbro')).toBe(false)
    expect(found.has('nover')).toBe(false)
  })

  it('survives a lock with nothing in it', () => {
    expect(installedFromLock({}).size).toBe(0)
    expect(installedFromLock(null).size).toBe(0)
  })
})

// An allowlist nobody prunes drifts into permanent permission — which is exactly
// what docs/standards.md refuses for the size and cycle baselines. Three entries
// (are-we-there-yet, gauge, npmlog) had already outlived their packages.
describe('staleAcknowledgements', () => {
  const installed = (pairs) => new Map(Object.entries(pairs))

  it('is empty when every entry still matches something installed', () => {
    const tree = installed({
      rimraf: ['2.6.3'],
      inflight: ['1.0.6'],
      glob: ['7.2.3', '10.5.0']
    })
    expect(staleAcknowledgements(tree)).toEqual([])
  })

  it('flags an entry whose package left the tree entirely', () => {
    const tree = installed({ rimraf: ['2.6.3'], inflight: ['1.0.6'], glob: ['7.2.3'] })
    expect(staleAcknowledgements(tree)).toContain('glob@10')
  })

  it('flags an entry whose major is gone even though the package remains', () => {
    const tree = installed({ rimraf: ['5.0.0'], inflight: ['1.0.6'], glob: ['7.2.3', '10.5.0'] })
    expect(staleAcknowledgements(tree)).toContain('rimraf@2')
  })

  // glob@1 must not be satisfied by 10.5.0.
  it('matches on a version boundary, not a string prefix', () => {
    const tree = installed({ rimraf: ['2.6.3'], inflight: ['1.0.6'], glob: ['10.5.0'] })
    expect(staleAcknowledgements(tree)).toContain('glob@7')
  })
})
