import { describe, expect, it } from 'vitest'
import {
  ACKNOWLEDGED,
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
