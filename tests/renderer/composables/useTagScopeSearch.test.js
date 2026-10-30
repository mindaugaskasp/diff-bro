import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useTagScopeSearch } from '../../../src/renderer/src/composables/useTagScopeSearch'

const key = (k) => ({ key: k, preventDefault: vi.fn() })
const setup = (q = '', s = '') => {
  const query = ref(q)
  const scope = ref(s)
  const api = useTagScopeSearch({ query, scope, tags: () => ['ops/k8s/prod', 'data'] })
  return { query, scope, ...api }
}

describe('useTagScopeSearch', () => {
  it('lists scopes only while the query starts with #', () => {
    expect(setup('k8').options.value).toEqual([])
    expect(setup('#k8').options.value).toEqual(['ops/k8s', 'ops/k8s/prod'])
  })

  it('the # button starts a scope search', () => {
    const s = setup('roll')
    s.startHash()
    expect(s.query.value).toBe('#')
  })

  it('arrows move through the scopes and Enter picks one, clearing the query', () => {
    const s = setup('#k8')
    s.onKeydown(key('ArrowDown'))
    s.onKeydown(key('Enter'))
    expect(s.scope.value).toBe('ops/k8s/prod')
    expect(s.query.value).toBe('')
  })

  it('Escape leaves # mode without picking', () => {
    const s = setup('#k8')
    s.onKeydown(key('Escape'))
    expect(s.query.value).toBe('')
    expect(s.scope.value).toBe('')
  })

  it('Backspace in an empty box takes the scope chip off', () => {
    const s = setup('', 'ops')
    s.onKeydown(key('Backspace'))
    expect(s.scope.value).toBe('')
  })

  it('leaves ordinary typing alone', () => {
    const s = setup('roll', 'ops')
    const e = key('Backspace')
    s.onKeydown(e)
    expect(s.scope.value).toBe('ops')
    expect(e.preventDefault).not.toHaveBeenCalled()
  })
})
