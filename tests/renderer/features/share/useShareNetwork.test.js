import { describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'

const lan = reactive({ enabled: true, online: true, reachable: new Set(['a', 'b']) })
vi.mock('../../../../src/renderer/src/features/lan', () => ({ useLanStore: () => lan }))
const { useShareNetwork } =
  await import('../../../../src/renderer/src/features/share/useShareNetwork')

function picker(initial) {
  const selected = ref(initial)
  return {
    selected,
    toggle: (fp) =>
      (selected.value = selected.value.includes(fp)
        ? selected.value.filter((x) => x !== fp)
        : [...selected.value, fp])
  }
}

describe('useShareNetwork', () => {
  it('unticks someone offline when the dialog opens, without the dropped note', () => {
    Object.assign(lan, { enabled: true, online: true, reachable: new Set(['a']) })
    const p = picker(['a', 'c'])
    const { network, networkNote } = useShareNetwork(p, () => false)
    expect(network.value).toBe(true)
    expect(p.selected.value).toEqual(['a'])
    expect(networkNote.value).toBeNull()
  })

  it('unticks a picked person who leaves, and says so until someone is picked', async () => {
    Object.assign(lan, { reachable: new Set(['a', 'b']) })
    const p = picker(['b'])
    const { networkNote } = useShareNetwork(p, () => false)
    lan.reachable = new Set(['a'])
    await nextTick()
    expect(p.selected.value).toEqual([])
    expect(networkNote.value).toBe('lan.share.dropped')
    p.toggle('a')
    await nextTick()
    expect(networkNote.value).toBeNull()
  })

  it('says when there is no network at all', () => {
    Object.assign(lan, { enabled: true, online: false, reachable: new Set() })
    const { networkNote } = useShareNetwork(picker([]), () => false)
    expect(networkNote.value).toBe('lan.share.noNetwork')
  })

  it('is today’s dialog when sharing on the network is off, except for a snippet', () => {
    Object.assign(lan, { enabled: false, online: true, reachable: new Set() })
    const diff = useShareNetwork(picker(['x']), () => false)
    expect(diff.reachable.value).toBeNull()
    expect(diff.networkNote.value).toBeNull()
    expect(useShareNetwork(picker([]), () => true).network.value).toBe(true)
  })
})
