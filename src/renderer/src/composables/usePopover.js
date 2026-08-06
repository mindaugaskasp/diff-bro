import { ref } from 'vue'
import { useBackdropClose } from './useBackdropClose'

// Open/close state for a panel anchored to a button — the View options and the
// toolbar's overflow menu. The logic lives here rather than inline in either
// SFC so it is unit-testable without mounting anything, the same reason
// useBackdropClose exists (see docs/standards.md, "Interaction bugs split two
// ways").
//
// No window-level keydown listener: Escape is bound to the ANCHOR, which
// contains the trigger and the panel, so it fires wherever focus legitimately
// is and cannot leak to a second popover or outlive the component.
//
// The backdrop sits BELOW the toolbar (see .popover-backdrop in ui.css), so a
// press on the other trigger dismisses this panel and opens that one in a single
// click — the behaviour MenuBar.vue's dropdowns already have.

/**
 * @param {{ onOpen?: () => void }} [opts] `onOpen` runs after the panel opens —
 *   the overflow menu re-measures there rather than on every resize while shut.
 */
export function usePopover({ onOpen } = {}) {
  const open = ref(false)

  function close() {
    open.value = false
  }

  function toggle() {
    open.value = !open.value
    if (open.value) onOpen?.()
  }

  // A press that began INSIDE the panel and released over the backdrop fires a
  // click whose target is the backdrop; closing on that would dismiss the panel
  // mid-drag (a text selection, a pointer that slipped). useBackdropClose gates
  // exactly that.
  const backdrop = useBackdropClose(close)

  function onKeydown(e) {
    if (e.key !== 'Escape' || !open.value) return
    // Stop it here: the same key closes a dialog behind the toolbar, and one
    // press should not do both.
    e.stopPropagation()
    close()
  }

  return { open, toggle, close, onKeydown, backdrop }
}
