<script setup>
// The shell every modal shares (backdrop, header, action row). Escape closes
// unless :escape-closes="false" (dialogs holding unsaved input).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { shaped } from '../utils/props'
import { useSettingsStore } from '../stores/settingsStore'
import { useDialogResize } from '../composables/useDialogResize'
import { useBackdropClose } from '../composables/useBackdropClose'
import { RESIZE_HANDLES } from '../utils/dialogResize'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  title: { type: String, required: true },
  // The panel is BaseDialog's, so a dialog styles its size with this prop.
  width: { type: String, default: null },
  closable: { type: Boolean, default: true },
  // A `data-tour` name for the PANEL, so the tour can stroke a dialog it is
  // explaining rather than blurring it. The backdrop takes fallthrough attrs,
  // which would anchor the whole screen instead.
  tour: { type: String, default: null },
  escapeCloses: { type: Boolean, default: true },
  // Opt-in backdrop-click close (useBackdropClose gates out a drag that starts
  // in the panel).
  closeOnBackdrop: { type: Boolean, default: false },
  // Drag-resizable from any edge/corner (size from useDialogResize).
  resizable: { type: Boolean, default: false },
  minSize: {
    type: Object,
    default: () => ({ width: 320, height: 240 }),
    validator: shaped('width', 'height')
  },
  /** @type {import('../types').DialogSize} */
  initialSize: {
    type: Object,
    default: null,
    validator: (v) => v === null || shaped('width', 'height')(v)
  }
})
const emit = defineEmits(['close', 'resize'])

const settings = useSettingsStore()
const panel = ref(null)

// The global "maximize dialogs" setting fills the window and hides the handles.
const maximized = computed(() => props.resizable && settings.maximizeDialogs)

const { style: resizeStyle, beginResize } = useDialogResize({
  panel,
  width: props.width,
  initial: props.initialSize,
  min: props.minSize,
  maximized: () => maximized.value,
  onResize: (size) => emit('resize', size)
})

const { onPointerDown: onBackdropDown, onClick: onBackdropClick } = useBackdropClose(() =>
  emit('close')
)

const panelStyle = computed(() =>
  props.resizable ? resizeStyle.value : props.width ? { width: props.width } : null
)

// Keep Tab inside the dialog (the app is still rendered behind the backdrop).
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
      :data-tour="tour"
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
          data-tip="Close"
          @click="emit('close')"
        >
          <AppIcon name="x" />
        </button>
      </div>
      <slot />
      <div v-if="$slots.actions" class="dialog-actions">
        <slot name="actions" />
      </div>
      <!-- Invisible edge/corner drag zones. -->
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
