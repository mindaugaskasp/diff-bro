// pnpm-lock.yaml. Packages are keyed `name@version`, and the `importers` block
// is the only place that says which of them the project actually asked for.
// Pure.
import { parse as parseYaml } from 'yaml'

// Same guard structuralDiff uses: an anchor bomb must not expand.
const YAML_OPTIONS = { maxAliasCount: 100, prettyErrors: false }

const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies']

/**
 * `@vue/shared@3.4.21` -> the LAST `@` is the separator, so a scoped name keeps
 * its own. A peer suffix — `vue@3.4.21(typescript@5.4.0)` — names a variant of
 * the same package, not a different one.
 */
export function splitPackageKey(key) {
  const bare = String(key)
    .replace(/^\//, '')
    .replace(/\(.*\)$/, '')
  const at = bare.lastIndexOf('@')
  if (at <= 0) return null
  const name = bare.slice(0, at)
  const version = bare.slice(at + 1)
  return name && version ? { name, version } : null
}

function importerNames(importers) {
  const direct = new Map()
  for (const importer of Object.values(importers ?? {})) {
    for (const field of DEP_FIELDS) {
      for (const name of Object.keys(importer?.[field] ?? {})) {
        direct.set(name, field === 'devDependencies' || direct.get(name) === true)
      }
    }
  }
  return direct
}

/** @returns {{packages: Array, knowsDirect: boolean}|null} */
export function parsePnpmLock(text) {
  const doc = parseYaml(text, YAML_OPTIONS)
  if (!doc || typeof doc !== 'object' || !doc.packages) return null
  const direct = importerNames(doc.importers)
  const out = []
  for (const key of Object.keys(doc.packages)) {
    const split = splitPackageKey(key)
    if (!split) continue
    out.push({
      name: split.name,
      version: split.version,
      direct: direct.has(split.name),
      dev: direct.get(split.name) === true,
      license: '',
      resolved: ''
    })
  }
  return { packages: out, knowsDirect: true }
}
