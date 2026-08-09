// go.sum — two lines per module, one for the zip and one for its go.mod. The
// module is what changed; the pair of hashes is not. Pure.

/** @returns {{packages: Array, knowsDirect: boolean}|null} */
export function parseGoSum(text) {
  const seen = new Map()
  for (const raw of String(text).split('\n')) {
    const [name, version] = raw.trim().split(/\s+/)
    if (!name || !version || !version.startsWith('v')) continue
    // `v1.2.3/go.mod` is the same module at the same version.
    const bare = version.replace(/\/go\.mod$/, '')
    if (!seen.has(name)) {
      seen.set(name, { name, version: bare, direct: false, dev: false, license: '', resolved: '' })
    }
  }
  return seen.size ? { packages: [...seen.values()], knowsDirect: false } : null
}
