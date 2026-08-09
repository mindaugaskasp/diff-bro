// package-lock.json / npm-shrinkwrap.json, both shapes. v2 and v3 carry a flat
// `packages` map keyed by install PATH; v1 carries a nested `dependencies` tree.
// Pure.

const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies']

// "node_modules/a/node_modules/@scope/b" is b, not the path it was hoisted to.
function nameFromPath(path) {
  const at = path.lastIndexOf('node_modules/')
  return at === -1 ? '' : path.slice(at + 'node_modules/'.length)
}

function directNames(root) {
  const names = new Set()
  for (const field of DEP_FIELDS) {
    for (const name of Object.keys(root?.[field] ?? {})) names.add(name)
  }
  return names
}

// Only the ROOT copy can be the one the manifest asked for. A package installed
// twice — once at the top and once nested under a dependency wanting another
// version — matches by name at both paths.
const packageAt = (path, name, entry, direct) => ({
  name,
  version: entry.version,
  direct: path === `node_modules/${name}` && direct.has(name),
  dev: entry.dev === true,
  license: typeof entry.license === 'string' ? entry.license : '',
  resolved: typeof entry.resolved === 'string' ? entry.resolved : ''
})

function fromPackages(doc) {
  const direct = directNames(doc.packages[''])
  const out = []
  for (const [path, entry] of Object.entries(doc.packages)) {
    // The root itself is the manifest, not a dependency; a link is a workspace
    // pointer whose real entry appears under its own path.
    if (!path || entry?.link || typeof entry?.version !== 'string') continue
    const name = nameFromPath(path)
    if (name) out.push(packageAt(path, name, entry, direct))
  }
  return out
}

// v1 nests a dependency's own dependencies inside it, so this walks. Depth is
// bounded because the tree came from JSON.parse, which has already rejected
// anything that did not terminate.
//
// Nothing is marked direct: v1's top level is the HOISTED tree, which holds
// transitive packages too, so depth 0 does not mean "asked for". Reporting it as
// direct would be a guess rendered as a fact.
function walkV1(tree, out) {
  for (const [name, entry] of Object.entries(tree ?? {})) {
    if (typeof entry?.version !== 'string') continue
    out.push({
      name,
      version: entry.version,
      direct: false,
      dev: entry.dev === true,
      license: '',
      resolved: typeof entry.resolved === 'string' ? entry.resolved : ''
    })
    if (entry.dependencies) walkV1(entry.dependencies, out)
  }
}

/**
 * @param {string} text
 * @returns {{packages: Array, knowsDirect: boolean}|null} null when the text is
 *   not a lockfile of this shape at all — the caller falls back to the text view.
 */
export function parseNpmLock(text) {
  const doc = JSON.parse(text)
  if (!doc || typeof doc !== 'object') return null
  if (doc.packages && typeof doc.packages === 'object') {
    return { packages: fromPackages(doc), knowsDirect: true }
  }
  if (doc.dependencies && typeof doc.dependencies === 'object') {
    const out = []
    walkV1(doc.dependencies, out)
    return { packages: out, knowsDirect: false }
  }
  return null
}
