// The dependency view: which comparisons offer it, and what it routes to.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { diffLocks } from '../../../src/renderer/src/utils/lockfile/lockDiff'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

const lockText = (deps) =>
  JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { dependencies: Object.fromEntries(Object.keys(deps).map((n) => [n, '*'])) },
      ...Object.fromEntries(
        Object.entries(deps).map(([n, v]) => [`node_modules/${n}`, { version: v }])
      )
    }
  })

const load = (diff, left, right, name = 'package-lock.json') => {
  diff.left = { path: `/a/${name}`, name, content: left }
  diff.right = { path: `/b/${name}`, name, content: right }
  diff.mode = 'files'
}

describe('dependency comparison', () => {
  it('offers the view when both sides are the same kind of lockfile', () => {
    const diff = useDiffStore()
    load(diff, lockText({ vue: '3.4.0' }), lockText({ vue: '3.5.0' }))
    expect(diff.canCompareDeps).toBe(true)
  })

  it('refuses when only one side is a lockfile', () => {
    const diff = useDiffStore()
    diff.left = { path: '/a', name: 'package-lock.json', content: lockText({ vue: '3.4.0' }) }
    diff.right = { path: '/b', name: 'notes.txt', content: 'hello' }
    diff.mode = 'files'
    expect(diff.canCompareDeps).toBe(false)
  })

  // A package-lock against a go.sum is two ecosystems, not a comparison.
  it('refuses two lockfiles of different ecosystems', () => {
    const diff = useDiffStore()
    diff.left = { path: '/a', name: 'package-lock.json', content: lockText({ vue: '3.4.0' }) }
    diff.right = { path: '/b', name: 'go.sum', content: 'github.com/a/b v1.0.0 h1:x=\n' }
    diff.mode = 'files'
    expect(diff.canCompareDeps).toBe(false)
  })

  it('refuses a lockfile that will not parse', () => {
    const diff = useDiffStore()
    load(diff, '{ not json', lockText({ vue: '3.5.0' }))
    expect(diff.canCompareDeps).toBe(false)
  })

  it('routes to the dependency viewer with the toggle on', () => {
    const diff = useDiffStore()
    load(diff, lockText({ vue: '3.4.0' }), lockText({ vue: '3.5.0' }))
    diff.semanticView = false
    expect(diff.comparableKind).toBe('text')
    diff.semanticView = true
    expect(diff.comparableKind).toBe('deps')
  })

  // A lockfile IS json, so the structure view would otherwise claim it — and a
  // 780-key tree is not what the reader asked for.
  it('wins over the structure view for the same file', () => {
    const diff = useDiffStore()
    load(diff, lockText({ vue: '3.4.0' }), lockText({ vue: '3.5.0' }))
    diff.semanticView = true
    expect(diff.canCompareStructure).toBe(true)
    expect(diff.comparableKind).toBe('deps')
  })

  it('opens in the dependency view without being asked', () => {
    const diff = useDiffStore()
    load(diff, lockText({ vue: '3.4.0' }), lockText({ vue: '3.5.0' }))
    diff.receive('left', {
      path: '/a',
      name: 'package-lock.json',
      content: lockText({ vue: '3.4.0' })
    })
    expect(diff.semanticView).toBe(true)
  })

  it('names the toggle after what it shows', () => {
    const diff = useDiffStore()
    load(diff, lockText({ vue: '3.4.0' }), lockText({ vue: '3.5.0' }))
    expect(diff.structureLabelKey).toBe('appToolbar.structureDeps')
  })

  // The store answers WHICH lockfiles; the viewer does the comparing.
  it('hands the viewer both parsed sides', () => {
    const diff = useDiffStore()
    load(diff, lockText({ vue: '3.4.0', gone: '1.0.0' }), lockText({ vue: '3.5.0' }))
    const { left, right } = diff.lockPair
    expect(left.kind).toBe('npm')
    expect(diffLocks(left, right).stats).toEqual({
      added: 0,
      removed: 1,
      bumped: 1,
      downgraded: 0
    })
  })

  it('has no pair to offer when a side is not a lockfile', () => {
    const diff = useDiffStore()
    load(diff, lockText({ vue: '3.4.0' }), lockText({ vue: '3.5.0' }), 'notes.txt')
    expect(diff.lockPair).toBeNull()
  })
})
