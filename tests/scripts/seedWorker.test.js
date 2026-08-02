// seed-worker.cjs imports these src/main modules directly, under Node's own ESM
// loader rather than a bundler: an extensionless relative import anywhere in
// their graph is unresolvable there, and `make local-seed` dies at startup.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MAIN = resolve('src/main')
const WORKER = resolve('scripts/seed-worker.cjs')
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g

function unresolvableImports(entry) {
  const bad = []
  const seen = new Set()
  const visit = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const [, spec] of readFileSync(file, 'utf-8').matchAll(RELATIVE_IMPORT)) {
      const target = resolve(dirname(file), spec)
      if (!extname(spec) || !existsSync(target)) {
        bad.push(`${relative(MAIN, file)} imports '${spec}'`)
        continue
      }
      visit(target)
    }
  }
  visit(join(MAIN, entry))
  return bad
}

const workerEntries = () => {
  const src = readFileSync(WORKER, 'utf-8')
  return [...src.matchAll(/import\(join\(src, '([^']+)'\)\)/g)].map(([, name]) => name)
}

describe('the src/main modules make local-seed loads standalone', () => {
  it('finds the entry modules the worker imports', () => {
    expect(workerEntries()).toEqual(
      expect.arrayContaining(['appData.js', 'vaultCrypt.js', 'sealing.js'])
    )
  })

  it.for(workerEntries())('%s resolves without a bundler', (entry) => {
    expect(unresolvableImports(entry)).toEqual([])
  })
})
