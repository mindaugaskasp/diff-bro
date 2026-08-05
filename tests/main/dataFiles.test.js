// The data directory is only "self-contained and portable" if the list of files
// it is made of is complete. Three files were missing from it, and the worst of
// them — retired-keys.key — meant moving the folder permanently orphaned every
// unopened diff sealed to a rotated-away key.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

import { DATA_FILES, STORE_NAMES, isStoreName, planDataDirMove } from '../../src/main/dataFiles'

const slash = (dir, name) => `${dir}/${name}`

const SRC = join(process.cwd(), 'src')

function sourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(path))
    else if (/\.(js|vue)$/.test(entry.name)) out.push(path)
  }
  return out
}

const PERSIST_CALL = /\b(?:save|load)Persisted\(\s*(?:'([^']+)'|([A-Za-z_$][\w$]*))/g

function persistedNames(text) {
  const consts = new Map(
    [...text.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']+)'/g)].map(([, id, value]) => [
      id,
      value
    ])
  )
  const names = []
  for (const [, quoted, identifier] of text.matchAll(PERSIST_CALL)) {
    const name = quoted ?? consts.get(identifier)
    if (name) names.push(name)
  }
  return names
}

describe('DATA_FILES', () => {
  it('covers the files the app writes into the data directory', () => {
    for (const name of [
      'vault.json',
      'snippets.json',
      'session.json',
      'identity.key',
      'identity.pub',
      'trusted-keys.json',
      'vault.key',
      'retired-keys.key',
      'settings.json',
      'theme.json'
    ]) {
      expect(DATA_FILES).toContain(name)
    }
  })

  it('carries every store', () => {
    for (const name of STORE_NAMES) expect(DATA_FILES).toContain(`${name}.json`)
  })

  // The guard that stops this from rotting: every dataFile('x') and every
  // persisted store name in the tree has to be accounted for, so a new data
  // file cannot be added without landing in the list. It resolves a name held
  // in a const too — writing `savePersisted(KEY, …)` is how onboarding.json and
  // sidebar.json slipped past a literals-only version of this.
  it('accounts for every dataFile() and persisted store name in the source', () => {
    const missing = new Set()
    for (const path of sourceFiles(SRC)) {
      const text = readFileSync(path, 'utf-8')
      for (const [, name] of text.matchAll(/\bdataFile\(\s*'([^']+)'/g)) {
        if (!DATA_FILES.includes(name)) missing.add(`${name} (dataFile)`)
      }
      for (const name of persistedNames(text)) {
        if (!STORE_NAMES.includes(name)) missing.add(`${name} (persisted store)`)
      }
    }
    expect([...missing]).toEqual([])
  })
})

// A name reaching store:load / store:save becomes a path, so an unknown one is
// refused rather than sanitised into something adjacent.
describe('isStoreName', () => {
  it('accepts every real store', () => {
    for (const name of STORE_NAMES) expect(isStoreName(name)).toBe(true)
  })

  it('rejects a traversing or absolute name', () => {
    for (const name of ['../../evil', '../vault', 'a/b', 'a\\b', '/etc/passwd', '', '.', '..']) {
      expect(isStoreName(name)).toBe(false)
    }
  })

  it('rejects a data file that is not a store', () => {
    for (const name of ['trusted-keys', 'identity', 'vault.key', 'vault.json']) {
      expect(isStoreName(name)).toBe(false)
    }
  })

  it('rejects a non-string', () => {
    for (const name of [null, undefined, 0, ['vault'], { toString: () => 'vault' }]) {
      expect(isStoreName(name)).toBe(false)
    }
  })
})

// Choosing a folder that already holds data ADOPTS it — that is what makes
// re-pointing after a reinstall work. Returning to the default must not do the
// same, or stale copies left in userData silently win over everything made
// while the data lived elsewhere.
describe('planDataDirMove', () => {
  const both = () => true
  const neither = () => false

  it('copies source-only files either way', () => {
    const plan = planDataDirMove({
      files: ['vault.json'],
      exists: (p) => p.startsWith('/from'),
      from: '/from',
      to: '/to',
      join: slash
    })
    expect(plan).toEqual([{ from: '/from/vault.json', to: '/to/vault.json', displace: null }])
  })

  it('adopts what is already at a chosen folder', () => {
    const plan = planDataDirMove({
      files: ['vault.json'],
      exists: both,
      from: '/from',
      to: '/to',
      join: slash
    })
    expect(plan).toEqual([])
  })

  it('carries data home on a reset, moving the stale copy aside', () => {
    const plan = planDataDirMove({
      files: ['vault.json', 'identity.key'],
      exists: both,
      from: '/custom',
      to: '/userData',
      join: slash,
      sourceWins: true
    })
    expect(plan).toEqual([
      {
        from: '/custom/vault.json',
        to: '/userData/vault.json',
        displace: '/userData/vault.json.superseded'
      },
      {
        from: '/custom/identity.key',
        to: '/userData/identity.key',
        displace: '/userData/identity.key.superseded'
      }
    ])
  })

  it('never displaces anything when the source has nothing to give', () => {
    expect(
      planDataDirMove({
        files: ['vault.json'],
        exists: (p) => p.startsWith('/userData'),
        from: '/custom',
        to: '/userData',
        join: slash,
        sourceWins: true
      })
    ).toEqual([])
  })

  it('is empty when neither side has the file', () => {
    expect(
      planDataDirMove({ files: ['vault.json'], exists: neither, from: '/a', to: '/b', join: slash })
    ).toEqual([])
  })
})
