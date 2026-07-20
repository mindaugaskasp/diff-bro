// CI safeguard: scan an `npm ci` log for deprecation / engine warnings and
// fail on anything that isn't explicitly acknowledged below. This keeps new
// deprecations (especially memory-leaking ones like `inflight`) from slipping
// in unnoticed — a new offender breaks the release build until a human looks
// at it and either fixes it or consciously adds it here.
//
// Usage: node scripts/check-install-warnings.mjs <npm-ci-log-file>
import { readFileSync } from 'fs'

// Known, reviewed warnings. Each entry is a substring matched against a
// warning line. Everything here is a BUILD-TIME-ONLY transitive dependency of
// electron-builder's native-rebuild toolchain (@electron/rebuild → node-gyp).
// This app ships no native modules, so that toolchain never runs at app
// runtime and the `inflight` memory leak can never be triggered by the app.
// Revisit whenever electron-builder is upgraded.
const ACKNOWLEDGED = [
  'rimraf@2', // node-gyp's rimraf; superseded upstream, build-time only
  'inflight@1.0.6', // leaks memory, but only inside node-gyp's glob at build time
  'glob@7', // pulls inflight; node-gyp dependency
  'are-we-there-yet', // npmlog stack, build-time only
  'gauge', // npmlog stack, build-time only
  'npmlog' // build-time progress logging
]

const logPath = process.argv[2]
if (!logPath) {
  console.error('usage: check-install-warnings.mjs <npm-ci-log-file>')
  process.exit(2)
}

const lines = readFileSync(logPath, 'utf8').split(/\r?\n/)
const warnings = lines.filter(
  (l) => /npm warn deprecated/i.test(l) || /EBADENGINE/i.test(l)
)

const unexpected = warnings.filter((l) => !ACKNOWLEDGED.some((ok) => l.includes(ok)))

if (unexpected.length) {
  console.error('\nUnexpected install warnings (not in the acknowledged allowlist):\n')
  for (const l of unexpected) console.error('  ' + l.trim())
  console.error(
    '\nFix the dependency, or — if it is a reviewed build-time-only transitive —\n' +
      'add it to ACKNOWLEDGED in scripts/check-install-warnings.mjs with a note.\n'
  )
  process.exit(1)
}

console.log(
  `Install-warning guard: OK (${warnings.length} warning(s), all acknowledged as build-time-only).`
)
