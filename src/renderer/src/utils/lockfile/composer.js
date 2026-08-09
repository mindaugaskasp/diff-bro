// composer.lock (PHP). Two arrays rather than a map — `packages` is production
// and `packages-dev` is not — and a licence is a list, because a package may be
// dual-licensed. Pure.

// "v1.2.3" is as common as "1.2.3" in this ecosystem, and "dev-main" is a branch
// pin that is a real version here.
const version = (entry) => (typeof entry?.version === 'string' ? entry.version : '')

const license = (entry) => {
  if (Array.isArray(entry?.license))
    return entry.license.filter((l) => typeof l === 'string').join(', ')
  return typeof entry?.license === 'string' ? entry.license : ''
}

function collect(list, dev, out) {
  if (!Array.isArray(list)) return
  for (const entry of list) {
    if (typeof entry?.name !== 'string' || !version(entry)) continue
    out.push({
      name: entry.name,
      version: version(entry),
      // composer.lock is the resolved set; which of them composer.json asked for
      // is not in this file.
      direct: false,
      dev,
      license: license(entry),
      resolved: typeof entry?.dist?.url === 'string' ? entry.dist.url : ''
    })
  }
}

/** @returns {{packages: Array, knowsDirect: boolean}|null} */
export function parseComposerLock(text) {
  const doc = JSON.parse(text)
  if (!doc || typeof doc !== 'object') return null
  if (!Array.isArray(doc.packages) && !Array.isArray(doc['packages-dev'])) return null
  const out = []
  collect(doc.packages, false, out)
  collect(doc['packages-dev'], true, out)
  return out.length ? { packages: out, knowsDirect: false } : null
}
