<script setup>
// Movable Mermaid viewer (diffStore.mermaidView): zoom, drag-pan, corner-resize,
// maximize; follows OS fullscreen.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useBackdropClose } from '../composables/useBackdropClose'
import { useResizable } from '../composables/useResizable'
import { useFullScreen } from '../composables/useFullScreen'
import { useZoomPan } from '../composables/useZoomPan'
import MermaidDiagram from './MermaidDiagram.vue'
import AppIcon from './AppIcon.vue'

const diff = useDiffStore()
const view = computed(() => diff.mermaidView) // { name, code }
const isFullScreen = useFullScreen()

const DEFAULT_W = 880
const DEFAULT_H = 620
const MIN = { width: 360, height: 260 }
const CORNERS = ['nw', 'ne', 'sw', 'se']

const { rect, setCentered, beginResize } = useResizable({ min: MIN })
const { scale, tx, ty, pct, zoom, fit, onWheel, onDown, onMove, onUp } = useZoomPan()
const maxed = ref(false)

const panelStyle = computed(() => ({
  left: `${rect.left}px`,
  top: `${rect.top}px`,
  width: `${rect.width}px`,
  height: `${rect.height}px`
}))

function fitPanel() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (maxed.value) setCentered(vw * 0.96, vh * 0.92)
  else setCentered(Math.min(DEFAULT_W, vw * 0.9), Math.min(DEFAULT_H, vh * 0.82))
}
function toggleMaxed() {
  maxed.value = !maxed.value
  fitPanel()
}
// A manual drag drops the maxed flag, so the button offers to fill again.
function startResize(corner, e) {
  maxed.value = false
  beginResize(corner, e)
}

function close() {
  diff.closeMermaid()
}

// Close on a backdrop click, but not when a resize drag merely releases there.
const { onPointerDown: onBackdropDown, onClick: onBackdropClick } = useBackdropClose(close)

function onKey(e) {
  if (e.key === 'Escape') close()
}
// Keep a maximised panel filling the window as it (or the OS fullscreen) resizes.
function onWindowResize() {
  if (maxed.value) fitPanel()
}
// Only react on the way in, so leaving fullscreen doesn't shrink a grown panel.
watch(isFullScreen, (on) => {
  if (on) {
    maxed.value = true
    fitPanel()
  }
})

onMounted(() => {
  // Open maximized; the restore button shrinks it to DEFAULT_W×H.
  maxed.value = true
  fitPanel()
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onWindowResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onWindowResize)
})
</script>

<template>
  <div v-if="view" class="viewer-backdrop" @pointerdown="onBackdropDown" @click="onBackdropClick">
    <div class="panel" :style="panelStyle">
      <div class="head">
        <span class="title">{{ view.name || 'Diagram' }}</span>
        <div class="tools">
          <button class="tbtn" data-tip="Zoom out" aria-label="Zoom out" @click="zoom(1 / 1.2)">
            <AppIcon name="minus" />
          </button>
          <span class="pct" @click="fit">{{ pct }}%</span>
          <button class="tbtn" data-tip="Zoom in" aria-label="Zoom in" @click="zoom(1.2)">
            <AppIcon name="plus" />
          </button>
          <button class="tbtn wide" data-tip="Scale the diagram to fit the window" @click="fit">
            Fit
          </button>
          <button
            class="tbtn"
            :data-tip="maxed ? 'Restore the previous size' : 'Fill the window'"
            :aria-label="maxed ? 'Restore size' : 'Maximize'"
            @click="toggleMaxed"
          >
            <AppIcon :name="maxed ? 'restore' : 'maximize'" />
          </button>
          <button
            class="tbtn close"
            data-tip="Close the viewer (Esc)"
            aria-label="Close"
            @click="close"
          >
            <AppIcon name="x" />
          </button>
        </div>
      </div>
      <div
        class="stage"
        @wheel="onWheel"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointerleave="onUp"
      >
        <div
          class="transform"
          :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }"
        >
          <MermaidDiagram :code="view.code" :debounce="0" />
        </div>
      </div>
      <div class="foot">
        <span class="hint">Drag to pan · Ctrl/⌘ + scroll to zoom · click % to fit</span>
        <span class="resize-hint">drag any corner to resize</span>
      </div>
      <span
        v-for="c in CORNERS"
        :key="c"
        class="resize-handle"
        :class="c"
        @pointerdown="startResize(c, $event)"
      />
    </div>
  </div>
</template>

<style scoped src="./styles/MermaidViewerDialog.css"></style>
