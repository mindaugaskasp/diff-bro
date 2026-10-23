import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useInlineEdit } from '../../../src/renderer/src/composables/useInlineEdit'

function setup({ editing = false, dirty = false, masked = false, isNew = false } = {}) {
  const state = {
    editMode: ref(editing),
    isDirty: ref(dirty),
    masked: ref(masked),
    isNew: ref(isNew)
  }
  return { state, ...useInlineEdit(state) }
}
const esc = (target = document.body, over = {}) => ({
  key: 'Escape',
  target,
  defaultPrevented: false,
  ...over
})

describe('useInlineEdit: entering', () => {
  it('a press on the content while viewing starts editing', () => {
    const { state, onContentPointerDown } = setup()
    onContentPointerDown()
    expect(state.editMode.value).toBe(true)
  })

  it('a masked secret is not edited until it is revealed', () => {
    const { state, onContentPointerDown } = setup({ masked: true })
    onContentPointerDown()
    expect(state.editMode.value).toBe(false)
  })
})

describe('useInlineEdit: leaving with Escape', () => {
  it('leaves editing when nothing changed', () => {
    const { state, onKeydown } = setup({ editing: true })
    onKeydown(esc())
    expect(state.editMode.value).toBe(false)
  })

  it('stays when there are unsaved changes', () => {
    const { state, onKeydown } = setup({ editing: true, dirty: true })
    onKeydown(esc())
    expect(state.editMode.value).toBe(true)
  })

  it('a new snippet has no viewing state to return to', () => {
    const { state, onKeydown } = setup({ editing: true, isNew: true })
    onKeydown(esc())
    expect(state.editMode.value).toBe(true)
  })

  // Heard in the capture phase, before Monaco: Monaco prevents every Escape it sees.
  it('still leaves editing when Monaco marked the Escape handled', () => {
    const { state, onKeydown } = setup({ editing: true })
    onKeydown(esc(document.body, { defaultPrevented: true }))
    expect(state.editMode.value).toBe(false)
  })

  it('leaves Escape to an open find or suggestion widget in the document', () => {
    const { state, onKeydown } = setup({ editing: true })
    const doc = document.createElement('section')
    doc.innerHTML = '<div class="find-widget visible"></div>'
    onKeydown(esc(document.body, { currentTarget: doc }))
    expect(state.editMode.value).toBe(true)
  })

  it('leaves Escape to a popover it started in', () => {
    const { state, onKeydown } = setup({ editing: true })
    const pop = document.createElement('div')
    pop.className = 'tag-pop'
    document.body.append(pop)
    onKeydown(esc(pop))
    expect(state.editMode.value).toBe(true)
    pop.remove()
  })

  it('ignores other keys', () => {
    const { state, onKeydown } = setup({ editing: true })
    onKeydown({ ...esc(), key: 'a' })
    expect(state.editMode.value).toBe(true)
  })
})
