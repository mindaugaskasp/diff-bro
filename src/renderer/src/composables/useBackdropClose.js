// Close a modal when its backdrop is clicked — but ONLY when the press began on
// the backdrop itself. A drag that starts inside the panel (a resize handle, a
// text selection) and releases over the backdrop makes the browser fire a click
// whose target is the backdrop, which would otherwise close the modal
// mid-interaction (this is the "resizing closes the Mermaid viewer" bug). Wiring
// onPointerDown + onClick to the backdrop element gates that out.
//
// Logic lives here, not inline in the component, so it is unit-testable without
// mounting anything — see tests/renderer/composables/useBackdropClose.test.js.
export function useBackdropClose(onClose) {
  let pressedBackdrop = false
  function onPointerDown(e) {
    pressedBackdrop = e.target === e.currentTarget
  }
  function onClick(e) {
    if (pressedBackdrop && e.target === e.currentTarget) onClose()
    pressedBackdrop = false
  }
  return { onPointerDown, onClick }
}
