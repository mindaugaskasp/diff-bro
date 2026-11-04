import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { useTabOverflow } from '../../../src/renderer/src/composables/useTabOverflow'

let onResize = null
let app = null
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
  delete globalThis.ResizeObserver
})

function mountStrip(activeId) {
  globalThis.ResizeObserver = class {
    constructor(cb) {
      onResize = cb
    }
    observe() {}
    disconnect() {}
  }
  const scrolled = []
  app = createApp({
    setup() {
      const track = ref(null)
      useTabOverflow(track, () => activeId.value)
      return () =>
        h(
          'div',
          { ref: track },
          ['a', 'b'].map((id) =>
            h('div', {
              key: id,
              'data-active': String(id === activeId.value),
              onVnodeMounted: ({ el }) => (el.scrollIntoView = (opts) => scrolled.push([id, opts]))
            })
          )
        )
    }
  })
  app.mount(document.body.appendChild(document.createElement('div')))
  return scrolled
}

describe('useTabOverflow', () => {
  // The track narrows when the actions beside it change or the chevrons appear;
  // the tab the reader is on must not be left half under the edge.
  it('brings the active tab back into view when the track resizes', () => {
    const scrolled = mountStrip(ref('a'))
    onResize()
    expect(scrolled).toEqual([['a', { block: 'nearest', inline: 'nearest' }]])
  })

  // #223: a frame between the patch and the reveal showed the new tab active but off-screen.
  it('reveals the newly active tab in the same flush that marks it active', async () => {
    const activeId = ref('a')
    const scrolled = mountStrip(activeId)
    activeId.value = 'b'
    await nextTick()
    expect(scrolled.map(([id]) => id)).toEqual(['b'])
  })
})
