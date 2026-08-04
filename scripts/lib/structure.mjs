// Structural guards with no Node or ESLint in them, so tests drive them with
// literal graphs. The runner (scripts/check-structure.mjs) supplies the tree.

import { dirname, join, normalize } from 'path/posix'

const RELATIVE_IMPORT = /(?:from|import)\s+['"](\.[^'"]+)['"]/g
const CANDIDATES = ['', '.js', '.mjs', '.vue', '/index.js']

// Bounds the walk on a dense graph; no legitimate import chain in this app is
// anywhere near it, and without it a diamond-heavy tree explores every path.
const MAX_PATH = 12

/**
 * @param {string[]} files    repo-relative, forward slashes
 * @param {(f: string) => string} read
 * @returns {Map<string, string[]>}
 */
export function buildGraph(files, read) {
  const known = new Set(files)
  const graph = new Map()
  for (const file of files) {
    const here = dirname(file)
    const targets = []
    for (const [, spec] of (read(file) ?? '').matchAll(RELATIVE_IMPORT)) {
      const base = normalize(join(here, spec))
      const hit = CANDIDATES.map((ext) => base + ext).find((c) => known.has(c))
      if (hit) targets.push(hit)
    }
    graph.set(file, targets)
  }
  return graph
}

/** Identity is the member SET: which file the walk entered from is directory order. */
export const cycleKey = (members) => [...members].sort().join(' | ')

/**
 * @param {Map<string, string[]>} graph
 * @returns {string[][]} each cycle once, self-edges excluded
 */
export function findCycles(graph) {
  const seen = new Set()
  const cycles = []

  const visit = (node, path) => {
    const at = path.indexOf(node)
    if (at >= 0) {
      const members = path.slice(at)
      const key = cycleKey(members)
      if (members.length > 1 && !seen.has(key)) {
        seen.add(key)
        cycles.push(members)
      }
      return
    }
    if (path.length >= MAX_PATH) return
    for (const next of graph.get(node) ?? []) visit(next, [...path, node])
  }

  for (const node of graph.keys()) visit(node, [])
  return cycles
}

/**
 * ESLint reports host-native absolute paths; every key in this guard is a
 * forward-slash repo path, so on Windows the two never meet.
 * @param {string} root      repo root, with or without a trailing separator
 * @param {string} absolute
 * @returns {string}
 */
export function repoRelative(root, absolute) {
  const slashed = (p) => p.replace(/\\/g, '/')
  const base = slashed(root).replace(/\/?$/, '/')
  const full = slashed(absolute)
  return full.startsWith(base) ? full.slice(base.length) : full
}

const beaten = (file, kind, cap, actual) =>
  typeof cap === 'number' && actual < cap ? [{ file, kind, cap, actual }] : []

/**
 * An entry whose file has dropped under its cap has stopped describing anything.
 * Left alone it becomes permanent permission, which is the failure mode the
 * ratchet exists to avoid — so beating a cap requires deleting its entry.
 *
 * @param {Record<string, {fn?: number, file?: number}>} legacy
 * @param {Record<string, {fn: number, file: number}>} measured
 * @returns {{file: string, kind: 'fn'|'file'|'gone', cap: number, actual: number}[]}
 */
export function staleEntries(legacy, measured) {
  const stale = []
  for (const [file, caps] of Object.entries(legacy)) {
    const now = measured[file]
    if (!now) {
      stale.push({ file, kind: 'gone', cap: 0, actual: 0 })
      continue
    }
    stale.push(...beaten(file, 'fn', caps.fn, now.fn), ...beaten(file, 'file', caps.file, now.file))
  }
  return stale
}
