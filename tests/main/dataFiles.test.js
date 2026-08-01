// The data directory is only "self-contained and portable" if the list of files
// it is made of is complete. Three files were missing from it, and the worst of
// them — retired-keys.key — meant moving the folder permanently orphaned every
// unopened diff sealed to a rotated-away key.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

import { DATA_FILES, planDataDirMove } from '../../src/main/dataFiles'

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

  // The guard that stops this from rotting: every dataFile('x') and every
  // savePersisted('x') in the tree has to be accounted for, so a new data file
  // cannot be added without landing in the list.
  it('accounts for every dataFile() and persisted store name in the source', () => {
    const missing = new Set()
    for (const path of sourceFiles(SRC)) {
      const text = readFileSync(path, 'utf-8')
      for (const [, name] of text.matchAll(/\bdataFile\(\s*'([^']+)'/g)) {
        if (!DATA_FILES.includes(name)) missing.add(`${name} (dataFile)`)
      }
      for (const [, name] of text.matchAll(/\bsavePersisted\(\s*'([^']+)'/g)) {
        if (!DATA_FILES.includes(`${name}.json`)) missing.add(`${name}.json (savePersisted)`)
      }
    }
    expect([...missing]).toEqual([])
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
