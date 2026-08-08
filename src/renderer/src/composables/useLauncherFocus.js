import { nextTick, watch } from 'vue'

// Who owns the keyboard in the launcher. The whole key driver hangs off the
// search box's @keydown, so ANY control that takes focus kills arrow navigation
// — clicking the preview's back arrow did exactly that. Pulled out of
// QuickLook.vue so the rule lives in one place and is unit-testable.

/**
 * @param {object} o
 * @param {{ value: {focus: () => void, reclaim: () => void}|null }} o.input   the search band
 * @param {{ value: {focus: () => void}|null }} o.composeEl                    the compose panel
 * @param {{ value: boolean }} o.composing
 * @param {{ value: object|null }} o.convertTool
 * @returns {{ focusInput: () => void, reclaimKeyboard: (e: Event) => void }}
 */
export function useLauncherFocus({ input, composeEl, composing, convertTool }) {
  function focusInput() {
    input.value?.focus()
    input.value?.select()
  }

  // Hand the keyboard back once, here, rather than per path: a click lands on a
  // button, that button's own handler has already run, and the search box takes
  // focus again unless a mode owns it or the click was on a field.
  function reclaimKeyboard(e) {
    if (composing.value || convertTool.value) return
    if (e.target.closest('input, textarea, select, [contenteditable]')) return
    input.value?.reclaim()
  }

  // Leaving either mode returns the keyboard to the search box.
  watch(convertTool, (tool) => {
    if (!tool) nextTick(focusInput)
  })
  watch(composing, (on) => {
    if (on) nextTick(() => composeEl.value?.focus())
    else nextTick(focusInput)
  })

  return { focusInput, reclaimKeyboard }
}
