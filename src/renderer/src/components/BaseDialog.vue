<script setup>
// The shell every modal shares: dimmed backdrop, header with title and ×, body,
// and a right-aligned action row. Dialogs supply content, not chrome.
//
// Escape closes by default. Dialogs holding unsaved input (the snippet editor)
// pass :escape-closes="false" so a stray keypress can't discard typing.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  title: { type: String, required: true },
  // The panel is BaseDialog's, so a dialog's own stylesheet can't size it —
  // scoped rules don't reach a child's inner elements. Any CSS width works.
  width: { type: String, default: null },
  // Hide the × for dialogs whose only exits are their own buttons.
  closable: { type: Boolean, default: true },
  escapeCloses: { type: Boolean, default: true }
})
const emit = defineEmits(['close'])

const panel = ref(null)

// Keep Tab inside the dialog: with the app still rendered behind the backdrop,
// tabbing out lands on controls the user can't see.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function trapTab(e) {
  const items = [...panel.value.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null
  )
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  const leavingBackwards = e.shiftKey && (active === first || !panel.value.contains(active))
  const leavingForwards = !e.shiftKey && active === last
  if (!leavingBackwards && !leavingForwards) return
  e.preventDefault()
  ;(leavingBackwards ? last : first).focus()
}

function onKeydown(e) {
  if (e.key === 'Escape' && props.escapeCloses) {
    e.stopPropagation()
    emit('close')
  } else if (e.key === 'Tab' && panel.value) {
    trapTab(e)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <div class="dialog-backdrop">
    <div
      ref="panel"
      class="dialog"
      :style="width ? { width } : null"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <div class="dialog-header">
        <h3>{{ title }}</h3>
        <button
          v-if="closable"
          type="button"
          class="dialog-close"
          aria-label="Close"
          @click="emit('close')"
        >
          <AppIcon name="x" />
        </button>
      </div>
      <slot />
      <div v-if="$slots.actions" class="dialog-actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
