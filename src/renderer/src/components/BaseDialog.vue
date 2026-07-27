<script setup>
// The shell every modal shares: dimmed backdrop, header with title and ×, body,
// and a right-aligned action row. Dialogs supply content, not chrome.
//
// Escape closes by default. Dialogs holding unsaved input (the snippet editor)
// pass :escape-closes="false" so a stray keypress can't discard typing.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { shaped } from '../utils/props'
import { useSettingsStore } from '../stores/settingsStore'
import { useDialogResize } from '../composables/useDialogResize'
import { useBackdropClose } from '../composables/useBackdropClose'
import { RESIZE_HANDLES } from '../utils/dialogResize'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  title: { type: String, required: true },
  // The panel is BaseDialog's, so a dialog's own stylesheet can't size it —
  // scoped rules don't reach a child's inner elements. Any CSS width works.
  width: { type: String, default: null },
  // Hide the × for dialogs whose only exits are their own buttons.
  closable: { type: Boolean, default: true },
  escapeCloses: { type: Boolean, default: true },
  // Close when the backdrop is clicked. Opt-in: dialogs holding unsaved input
  // keep it off. A press that begins inside the panel (a resize-handle drag, a
  // text selection) and releases on the backdrop does NOT close — useBackdropClose
  // gates that out.
  closeOnBackdrop: { type: Boolean, default: false },
  // Let the user drag the panel bigger/smaller from any edge or corner. When on,
  // the panel's size comes from useDialogResize (default → drag → persisted).
  resizable: { type: Boolean, default: false },
  // Smallest the panel may be dragged, in px.
  minSize: { type: Object, default: () => ({ width: 320, height: 240 }), validator: shaped('width', 'height') },
  // Remembered { width, height } in px to restore on open, or null for default.
  /** @type {import('../types').DialogSize} */
  initialSize: { type: Object, default: null, validator: (v) => v === null || shaped('width', 'height')(v) }
})
const emit = defineEmits(['close', 'resize'])

const settings = useSettingsStore()
const panel = ref(null)

// Global "maximize dialogs" forces every resizable panel to fill the window; the
// resize handles hide while it's on (untoggle to restore the remembered size).
const maximized = computed(() => props.resizable && settings.maximizeDialogs)

const { style: resizeStyle, beginResize } = useDialogResize({
  panel,
  width: props.width,
  initial: props.initialSize,
  min: props.minSize,
  maximized: () => maximized.value,
  onResize: (size) => emit('resize', size)
})

// Backdrop click-to-close (opt-in). Gated so a drag that starts in the panel and
// releases on the backdrop can't close it.
const { onPointerDown: onBackdropDown, onClick: onBackdropClick } = useBackdropClose(() =>
  emit('close')
)

// Resizable panels take their size from the composable (default width, then the
// live drag); everything else just applies its fixed width.
const panelStyle = computed(() =>
  props.resizable ? resizeStyle.value : props.width ? { width: props.width } : null
)

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
  <div
    class="dialog-backdrop"
    @pointerdown="closeOnBackdrop && onBackdropDown($event)"
    @click="closeOnBackdrop && onBackdropClick($event)"
  >
    <div
      ref="panel"
      class="dialog"
      :class="{ 'dialog--resizable': resizable }"
      :style="panelStyle"
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
          title="Close"
          @click="emit('close')"
        >
          <AppIcon name="x" />
        </button>
      </div>
      <slot />
      <div v-if="$slots.actions" class="dialog-actions">
        <slot name="actions" />
      </div>
      <!-- Invisible drag zones over the panel's padding ring — one per edge and
           corner — so the dialog resizes like a window from any side. -->
      <span
        v-for="h in resizable && !maximized ? RESIZE_HANDLES : []"
        :key="h"
        class="dlg-resize"
        :class="h"
        @pointerdown="beginResize(h, $event)"
      />
    </div>
  </div>
</template>
