import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, ref } from 'vue'
import { useTabOverflow } from '../../../src/renderer/src/composables/useTabOverflow'

let onResize = null
let app = null
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
  delete globalThis.ResizeObserver
})

function mountStrip() {
  globalThis.ResizeObserver = class {
    constructor(cb) {
      onResize = cb
    }
    observe() {}
    disconnect() {}
  }
  const track = document.createElement('div')
  const active = document.createElement('div')
  active.dataset.active = 'true'
  active.scrollIntoView = vi.fn()
  track.append(active)
  document.body.append(track)
  app = createApp({
    setup() {
      useTabOverflow(ref(track), () => 'a')
      return () => h('div')
    }
  })
  app.mount(document.createElement('div'))
  return active
}

describe('useTabOverflow', () => {
  // The track narrows when the actions beside it change or the chevrons appear;
  // the tab the reader is on must not be left half under the edge.
  it('brings the active tab back into view when the track resizes', () => {
    const active = mountStrip()
    onResize()
    expect(active.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
  })
})
