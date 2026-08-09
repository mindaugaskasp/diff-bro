// yarn.lock v1 — a bespoke text format, not YAML. Blocks are separated by blank
// lines; a block's header is one or more comma-separated `name@range` specs
// ending in a colon, and its `version "x"` line is the resolved version. Pure.

// `"@vue/shared@3.4.21"` and `lodash@^4.0.0` — the LAST `@` separates the range,
// so a scoped name keeps its own.
function nameFromSpec(spec) {
  const bare = spec.trim().replace(/^"|"$/g, '')
  const at = bare.lastIndexOf('@')
  return at > 0 ? bare.slice(0, at) : bare
}

const isHeader = (line) => !line.startsWith(' ') && !line.startsWith('#') && line.endsWith(':')

/**
 * @returns {{packages: Array, knowsDirect: boolean}|null} `knowsDirect` is false:
 *   a v1 lockfile records ranges, never which of them the manifest asked for.
 */
export function parseYarnLock(text) {
  const lines = String(text).split('\n')
  const out = []
  let name = ''
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (isHeader(line)) {
      // Every spec in the header resolves to the same package, so the first
      // names it.
      name = nameFromSpec(line.slice(0, -1).split(',')[0])
      continue
    }
    const version = /^\s+version\s+"?([^"\s]+)"?/.exec(line)
    if (name && version) {
      out.push({ name, version: version[1], direct: false, dev: false, license: '', resolved: '' })
      name = ''
    }
  }
  return out.length ? { packages: out, knowsDirect: false } : null
}
