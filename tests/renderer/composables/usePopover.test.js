import { describe, expect, it, vi } from 'vitest'
import { usePopover } from '../../../src/renderer/src/composables/usePopover'

// A press/release pair on the backdrop element itself.
const pressOn = (backdrop, el) => {
  backdrop.onPointerDown({ target: el, currentTarget: el })
  backdrop.onClick({ target: el, currentTarget: el })
}

const escape = () => ({ key: 'Escape', stopPropagation: vi.fn() })

describe('usePopover', () => {
  it('starts closed and toggles', () => {
    const p = usePopover()
    expect(p.open.value).toBe(false)
    p.toggle()
    expect(p.open.value).toBe(true)
    p.toggle()
    expect(p.open.value).toBe(false)
  })

  it('runs onOpen only when it opens, never when it shuts', () => {
    const onOpen = vi.fn()
    const p = usePopover({ onOpen })
    p.toggle()
    expect(onOpen).toHaveBeenCalledTimes(1)
    p.toggle()
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and stops the key reaching a dialog behind it', () => {
    const p = usePopover()
    p.toggle()
    const e = escape()
    p.onKeydown(e)
    expect(p.open.value).toBe(false)
    expect(e.stopPropagation).toHaveBeenCalled()
  })

  it('lets Escape through when it is already closed', () => {
    const p = usePopover()
    const e = escape()
    p.onKeydown(e)
    // Nothing to close, so the dialog behind must still get the key.
    expect(e.stopPropagation).not.toHaveBeenCalled()
  })

  it('ignores any other key', () => {
    const p = usePopover()
    p.toggle()
    p.onKeydown({ key: 'Enter', stopPropagation: vi.fn() })
    expect(p.open.value).toBe(true)
  })

  it('closes on a press that starts and ends on the backdrop', () => {
    const p = usePopover()
    p.toggle()
    const el = {}
    pressOn(p.backdrop, el)
    expect(p.open.value).toBe(false)
  })

  // The Mermaid-viewer bug, in popover form: a drag that begins inside the panel
  // and releases over the backdrop fires a click targeting the backdrop.
  it('survives a drag that began inside the panel and released on the backdrop', () => {
    const p = usePopover()
    p.toggle()
    const backdropEl = {}
    const insideEl = {}
    p.backdrop.onPointerDown({ target: insideEl, currentTarget: backdropEl })
    p.backdrop.onClick({ target: backdropEl, currentTarget: backdropEl })
    expect(p.open.value).toBe(true)
  })
})
