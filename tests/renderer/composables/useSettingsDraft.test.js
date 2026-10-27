import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsDraft } from '../../../src/renderer/src/composables/useSettingsDraft'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'
import { useUiStore } from '../../../src/renderer/src/stores/uiStore'

let files
let pinia

function mountDraft(close = vi.fn()) {
  let draft
  const app = createApp({
    setup() {
      draft = useSettingsDraft({ close })
      return () => h('div')
    }
  })
  app.use(pinia)
  const el = document.createElement('div')
  document.body.append(el)
  app.mount(el)
  return { draft, close, unmount: () => app.unmount() }
}

beforeEach(() => {
  files = {}
  window.api = {
    storeLoad: (name) => files[name] ?? null,
    storeSave: (name, contents) => {
      files[name] = contents
    }
  }
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => {
  delete window.api
  document.body.innerHTML = ''
})

describe('useSettingsDraft', () => {
  it('closes at once with nothing changed', () => {
    const { draft, close } = mountDraft()
    draft.requestClose()
    expect(draft.asking.value).toBe(false)
    expect(close).toHaveBeenCalled()
  })

  it('writes nothing until Save, then writes the change', () => {
    const { draft } = mountDraft()
    useSettingsStore().setShowRowTags(false)
    expect(files.settings).toBeUndefined()
    expect(draft.isDirty.value).toBe(true)
    draft.save()
    expect(JSON.parse(files.settings).showRowTags).toBe(false)
    expect(draft.isDirty.value).toBe(false)
  })

  it('asks before closing on a change, and Keep editing keeps it', () => {
    const { draft, close } = mountDraft()
    useUiStore().diffZoom = 1.5
    draft.requestClose()
    expect(draft.asking.value).toBe(true)
    expect(close).not.toHaveBeenCalled()
    draft.answer('keep')
    expect(draft.asking.value).toBe(false)
    expect(useUiStore().diffZoom).toBe(1.5)
  })

  it('a discard restores the draft but keeps what the app changed meanwhile', () => {
    const settings = useSettingsStore()
    const { draft, close } = mountDraft()
    settings.setShowRowTags(false)
    settings.examplesSeeded = true
    draft.requestClose()
    draft.answer('discard')
    expect(close).toHaveBeenCalled()
    expect(settings.showRowTags).toBe(true)
    const saved = JSON.parse(files.settings)
    expect(saved.showRowTags).toBe(true)
    expect(saved.examplesSeeded).toBe(true)
  })

  it('runs what was waiting on the close only once the dialog has closed', () => {
    const after = vi.fn()
    const { draft } = mountDraft()
    useSettingsStore().setShowRowTags(false)
    draft.requestClose(after)
    expect(after).not.toHaveBeenCalled()
    draft.answer('save')
    expect(after).toHaveBeenCalledOnce()
  })

  it('an unmount with the draft still open discards it', () => {
    const { unmount } = mountDraft()
    useSettingsStore().setShowRowTags(false)
    unmount()
    expect(useSettingsStore().showRowTags).toBe(true)
  })
})
