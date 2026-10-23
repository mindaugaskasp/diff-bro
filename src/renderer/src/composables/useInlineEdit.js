// Editing in place: a press on the content starts it, Escape leaves it when there
// is nothing to lose. Saving and the tab's close guard cover the rest.

// Escape belongs to these first: closing find or a suggestion list is not "stop editing".
const OWNS_ESCAPE = '.find-widget, .suggest-widget, .tag-pop, .tt-pop, [role="dialog"]'
const OPEN_WIDGET = '.find-widget.visible, .suggest-widget.visible'

function isClaimedEscape(e) {
  return Boolean(e.target?.closest?.(OWNS_ESCAPE) || e.currentTarget?.querySelector?.(OPEN_WIDGET))
}

/**
 * @param {object} args
 * @param {import('vue').Ref<boolean>} args.editMode
 * @param {import('vue').Ref<boolean>} args.isDirty
 * @param {import('vue').Ref<boolean>} args.masked
 * @param {import('vue').Ref<boolean>} args.isNew
 */
export function useInlineEdit({ editMode, isDirty, masked, isNew }) {
  function onContentPointerDown() {
    if (!editMode.value && !masked.value) editMode.value = true
  }
  function onKeydown(e) {
    // Bound in the capture phase: Monaco marks every Escape handled, open widget or not.
    if (e.key !== 'Escape' || !editMode.value) return
    if (isDirty.value || isNew.value) return
    if (!isClaimedEscape(e)) editMode.value = false
  }
  return { onContentPointerDown, onKeydown }
}
