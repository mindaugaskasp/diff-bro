import { beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useVaultStore } from '../../../src/renderer/src/stores/vaultStore'
import {
  useDiffRows,
  OWN_GROUPS,
  RECEIVED_GROUPS
} from '../../../src/renderer/src/composables/useDiffRows'

const entry = (id, extra) => ({ id, name: id, tags: [], expiresAt: null, ...extra })

let filter
beforeEach(() => {
  setActivePinia(createPinia())
  useVaultStore().entries = [
    entry('alpha', { tags: ['finance'] }),
    entry('beta', { favorite: true }),
    entry('gamma', { from: 'fp', tags: ['finance'] })
  ]
  filter = reactive({ search: '', tags: [], favOnly: false })
})

const names = (rows) => rows.value.map((r) => r.entry.name)

describe('useDiffRows', () => {
  it('lists your own diffs starred first, and only the received ones in the other', () => {
    expect(names(useDiffRows(() => filter, OWN_GROUPS).rows)).toEqual(['beta', 'alpha'])
    expect(names(useDiffRows(() => filter, RECEIVED_GROUPS).rows)).toEqual(['gamma'])
  })

  it('narrows by search and by tag, and says when a filter is on', () => {
    const own = useDiffRows(() => filter, OWN_GROUPS)
    expect(own.filtering.value).toBe(false)
    filter.tags = ['finance']
    expect(names(own.rows)).toEqual(['alpha'])
    filter.tags = []
    filter.search = ' BET '
    expect(names(own.rows)).toEqual(['beta'])
  })

  it('keeps only the starred group under the ★ filter', () => {
    filter.favOnly = true
    expect(names(useDiffRows(() => filter, OWN_GROUPS).rows)).toEqual(['beta'])
  })

  it('places each row by its index in the full group', () => {
    filter.search = 'alpha'
    const [row] = useDiffRows(() => filter, OWN_GROUPS).rows.value
    expect(row).toMatchObject({ group: 'ownActive', index: 0 })
  })
})
