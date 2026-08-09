// The history dialog's diff pair: two decrypts race per selection, and the
// copy button serves pair.after — a stale load landing after a newer click
// would put the WRONG version on the clipboard.
import { describe, expect, it } from 'vitest'
import { useVersionPair } from '../../../src/renderer/src/composables/useVersionPair'

const gate = () => {
  let open
  const opened = new Promise((resolve) => (open = resolve))
  return { open, opened }
}

describe('useVersionPair', () => {
  it('loads the selected version against its predecessor', async () => {
    const { pair, select } = useVersionPair(async (i) => `v${i}`)
    await select(2, 1)
    expect(pair.value).toEqual({ before: 'v1', after: 'v2' })
  })

  it('the oldest version diffs against nothing', async () => {
    const { pair, select } = useVersionPair(async (i) => `v${i}`)
    await select(0, -1)
    expect(pair.value).toEqual({ before: '', after: 'v0' })
  })

  it('a stale load never overwrites a newer selection', async () => {
    const slow = gate()
    const textAt = async (i) => {
      if (i === 9) await slow.opened
      return `v${i}`
    }
    const { selected, pair, select } = useVersionPair(textAt)

    const first = select(9, 8) // slow — still in flight when the user clicks on
    await select(2, 1) // fast — the selection the user is looking at
    slow.open()
    await first

    expect(selected.value).toBe(2)
    expect(pair.value).toEqual({ before: 'v1', after: 'v2' })
  })
})
