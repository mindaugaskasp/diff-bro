import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOpenWithStore } from '../../../../src/renderer/src/features/openWith/openWithStore'

describe('openWithStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('answers the ask with the choice and clears the prompt', async () => {
    const store = useOpenWithStore()
    const answer = store.ask({ previous: 'a.txt', next: 'b.txt' })
    expect(store.prompt).toEqual({ previous: 'a.txt', next: 'b.txt' })
    store.choose('compare')
    expect(await answer).toBe('compare')
    expect(store.prompt).toBeNull()
  })

  it('a newer ask settles the older one as a new tab', async () => {
    const store = useOpenWithStore()
    const first = store.ask({ previous: 'a.txt', next: 'b.txt' })
    store.ask({ previous: 'a.txt', next: 'c.txt' })
    expect(await first).toBe('tab')
    expect(store.prompt.next).toBe('c.txt')
  })
})
