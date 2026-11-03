import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRunnerStore } from '../../../../src/renderer/src/features/runner/runnerStore'

const OFF = { enabled: false, path: null, version: null }
const PHP = { enabled: true, path: '/bin/php', version: '8.3.6' }

beforeEach(() => {
  setActivePinia(createPinia())
  window.api = {
    runStatus: vi.fn(async () => ({ php: OFF, python: OFF })),
    runEnable: vi.fn(async () => ({ ok: true, status: { php: PHP, python: OFF } })),
    runDisable: vi.fn(async () => ({ ok: true, status: { php: OFF, python: OFF } })),
    runChange: vi.fn(async () => ({ ok: true, status: { php: PHP, python: OFF } }))
  }
})

describe('runnerStore settings', () => {
  it('loads what main holds', async () => {
    const store = useRunnerStore()
    await store.load()
    expect(store.status).toEqual({ php: OFF, python: OFF })
  })

  it('takes the status main answers after enabling', async () => {
    const store = useRunnerStore()
    await store.enable('php')
    expect(window.api.runEnable).toHaveBeenCalledWith('php')
    expect(store.status.php).toEqual(PHP)
    expect(store.errorFor('php')).toBeNull()
  })

  it('stays off when you cancel, without calling it an error', async () => {
    window.api.runEnable = vi.fn(async () => ({ cancelled: true }))
    const store = useRunnerStore()
    await store.load()
    await store.enable('php')
    expect(store.status.php.enabled).toBe(false)
    expect(store.errorFor('php')).toBeNull()
  })

  it('remembers which language turned down the program', async () => {
    window.api.runChange = vi.fn(async () => ({ error: 'not-that-language' }))
    const store = useRunnerStore()
    await store.load()
    await store.change('python')
    expect(store.errorFor('python')).toBe('not-that-language')
    expect(store.errorFor('php')).toBeNull()
  })

  it('clears the error on the next try', async () => {
    window.api.runChange = vi.fn(async () => ({ error: 'not-that-language' }))
    const store = useRunnerStore()
    await store.change('php')
    window.api.runChange = vi.fn(async () => ({ ok: true, status: { php: PHP, python: OFF } }))
    await store.change('php')
    expect(store.errorFor('php')).toBeNull()
  })

  it('disables through main', async () => {
    const store = useRunnerStore()
    await store.disable('php')
    expect(window.api.runDisable).toHaveBeenCalledWith('php')
    expect(store.status.php.enabled).toBe(false)
  })
})
