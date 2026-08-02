import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, ref } from 'vue'
import {
  offerToolOutput,
  toolOutput,
  clearToolOutput
} from '../../../src/renderer/src/composables/useToolOutput'

function mountWith(setup) {
  const app = createApp({
    setup() {
      setup()
      return () => h('div')
    }
  })
  const el = document.createElement('div')
  document.body.append(el)
  app.mount(el)
  return () => {
    app.unmount()
    el.remove()
  }
}

afterEach(() => {
  clearToolOutput()
  document.body.innerHTML = ''
})

describe('useToolOutput', () => {
  it('offers what the panel currently holds, read lazily', () => {
    const text = ref('first')
    const unmount = mountWith(() => offerToolOutput(() => text.value, () => 'json'))
    expect(toolOutput()).toEqual({ text: 'first', language: 'json' })
    text.value = 'second'
    expect(toolOutput().text).toBe('second')
    unmount()
  })

  it('offers nothing while the panel is empty', () => {
    const unmount = mountWith(() => offerToolOutput(() => '   ', () => 'plaintext'))
    expect(toolOutput()).toBeNull()
    unmount()
  })

  // A stale offer would let the NEXT tool save the previous one's output — the
  // same bug the capture region had before it handed the slot back.
  it('takes the offer back when the panel unmounts', () => {
    const unmount = mountWith(() => offerToolOutput(() => 'kept', () => 'plaintext'))
    expect(toolOutput()).not.toBeNull()
    unmount()
    expect(toolOutput()).toBeNull()
  })
})
