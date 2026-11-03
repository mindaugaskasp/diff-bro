import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSnippetFill } from '../../../src/renderer/src/composables/useSnippetFill'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import { useUiStore } from '../../../src/renderer/src/stores/uiStore'

const LINE = 'Deploying {{service}} to staging on {{today}}'
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

beforeEach(() => {
  setActivePinia(createPinia())
  window.api = { copyText: vi.fn(async () => true) }
  useSnippetStore().pendingFill = { name: 'Deploy', content: LINE, snippetId: 'mine' }
})

describe('useSnippetFill', () => {
  it('asks for every blank, with the date already in', () => {
    const fill = useSnippetFill()
    expect(fill.vars).toEqual(['service', 'today'])
    expect(fill.values.value).toEqual({ service: '', today: iso(new Date()) })
  })

  it('Copy filled copies the finished line, closes, and says which snippet it was', async () => {
    const fill = useSnippetFill()
    fill.values.value.service = 'billing'
    await fill.copyFilled()
    expect(window.api.copyText).toHaveBeenCalledWith(
      `Deploying billing to staging on ${iso(new Date())}`
    )
    expect(useSnippetStore().pendingFill).toBeNull()
    expect(useUiStore().lastSnippetFill).toEqual({ snippetId: 'mine' })
  })

  it('Cancel closes without copying or recording a fill', () => {
    const fill = useSnippetFill()
    fill.close()
    expect(useSnippetStore().pendingFill).toBeNull()
    expect(window.api.copyText).not.toHaveBeenCalled()
    expect(useUiStore().lastSnippetFill).toBeNull()
  })
})
