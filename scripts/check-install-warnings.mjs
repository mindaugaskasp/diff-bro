// CI safeguard: scan an `npm ci` log for deprecation / engine warnings and fail
// on anything not explicitly acknowledged. A new offender breaks the build until
// a human looks at it and either fixes it or consciously signs it off.
//
// The list and the matching live in scripts/lib/installWarnings.mjs so they are
// unit-testable — before this split, the allowlist could only report itself
// wrong during a release build.
//
// Usage: node scripts/check-install-warnings.mjs <npm-ci-log-file>
import { readFileSync } from 'fs'
import { unexpectedWarnings, warningLines } from './lib/installWarnings.mjs'

const logPath = process.argv[2]
if (!logPath) {
  console.error('usage: check-install-warnings.mjs <npm-ci-log-file>')
  process.exit(2)
}

const log = readFileSync(logPath, 'utf8')
const unexpected = unexpectedWarnings(log)

if (unexpected.length) {
  console.error('\nUnexpected install warnings (not in the acknowledged allowlist):\n')
  for (const l of unexpected) console.error('  ' + l.trim())
  console.error(
    '\nFix the dependency, or — if it is a reviewed build-time-only transitive —\n' +
      'add it to ACKNOWLEDGED in scripts/lib/installWarnings.mjs with a note.\n'
  )
  process.exit(1)
}

console.log(
  `Install-warning guard: OK (${warningLines(log).length} warning(s), all acknowledged as build-time-only).`
)
