// The install-warning allowlist and the matching, split from the CLI so the
// list is testable without running an install — which is the only way anyone
// finds out it is wrong today, and only during a release build.

// Each entry is a substring matched against a warning line. All are DEV or
// BUILD-TIME-ONLY transitives: nothing here is reachable from the packaged app,
// and `npm audit` reports zero vulnerabilities against the locked tree. Two
// separate toolchains feed this list, so the reason differs per entry.
export const ACKNOWLEDGED = [
  // electron-builder's native-rebuild toolchain (@electron/rebuild → node-gyp).
  // The app ships no native modules, so it never runs at app runtime and the
  // `inflight` leak cannot be reached from the app.
  'rimraf@2', // node-gyp's rimraf; superseded upstream, build-time only
  'inflight@1.0.6', // leaks memory, but only inside node-gyp's glob at build time
  'glob@7', // pulls inflight; node-gyp dependency
  'are-we-there-yet', // npmlog stack, build-time only
  'gauge', // npmlog stack, build-time only
  'npmlog', // build-time progress logging
  // @intlify/eslint-plugin-vue-i18n depends on glob@^10, deprecated upstream
  // after 4.5.1 shipped. 4.5.1 IS the latest plugin, so there is no upgrade to
  // take, and an `overrides` pin would force a breaking major into someone
  // else's tool for a lint-only dependency (docs/standards.md).
  'glob@10'
]

const IS_WARNING = (line) => /npm warn deprecated/i.test(line) || /EBADENGINE/i.test(line)

/**
 * Every deprecation / engine warning in an `npm ci` log.
 * @param {string} log
 * @returns {string[]}
 */
export const warningLines = (log) =>
  String(log ?? '')
    .split(/\r?\n/)
    .filter(IS_WARNING)

/**
 * The warning lines nobody has signed off on.
 * @param {string} log
 * @returns {string[]}
 */
export const unexpectedWarnings = (log) =>
  warningLines(log).filter((line) => !ACKNOWLEDGED.some((ok) => line.includes(ok)))
