<script setup>
// Full-screen-ish, resizable Mermaid viewer. Opened from the snippet editor's
// live preview or a Mermaid snippet row (diffStore.mermaidView). Supports
// zoom (buttons + Ctrl/⌘-wheel), drag-to-pan, Fit, and a maximize toggle; the
// panel itself is CSS-resizable so users can size it to the diagram.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useBackdropClose } from '../composables/useBackdropClose'
import MermaidDiagram from './MermaidDiagram.vue'
import AppIcon from './AppIcon.vue'

const diff = useDiffStore()
const view = computed(() => diff.mermaidView) // { name, code }

const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const maxed = ref(false)

const SCALE_MIN = 0.2
const SCALE_MAX = 8
const pct = computed(() => Math.round(scale.value * 100))

function clamp(v) {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, v))
}
function zoom(factor) {
  scale.value = clamp(scale.value * factor)
}
function fit() {
  // The diagram is constrained to the viewport by CSS (max-width/height 100%),
  // so scale 1 with no offset is the fitted view.
  scale.value = 1
  tx.value = 0
  ty.value = 0
}
function onWheel(e) {
  if (!e.ctrlKey && !e.metaKey) return // plain scroll left for the OS/trackpad
  e.preventDefault()
  zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1)
}

// Drag to pan.
let dragging = false
let startX = 0
let startY = 0
function onDown(e) {
  dragging = true
  startX = e.clientX - tx.value
  startY = e.clientY - ty.value
}
function onMove(e) {
  if (!dragging) return
  tx.value = e.clientX - startX
  ty.value = e.clientY - startY
}
function onUp() {
  dragging = false
}

function close() {
  diff.closeMermaid()
}

// Close on a backdrop click, but not when a resize drag merely releases there.
const { onPointerDown: onBackdropDown, onClick: onBackdropClick } = useBackdropClose(close)

function onKey(e) {
  if (e.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="view" class="viewer-backdrop" @pointerdown="onBackdropDown" @click="onBackdropClick">
    <div class="panel" :class="{ maxed }">
      <div class="head">
        <span class="title">{{ view.name || 'Diagram' }}</span>
        <div class="tools">
          <button class="tbtn" title="Zoom out" @click="zoom(1 / 1.2)">
            <AppIcon name="minus" />
          </button>
          <span class="pct" @click="fit">{{ pct }}%</span>
          <button class="tbtn" title="Zoom in" @click="zoom(1.2)"><AppIcon name="plus" /></button>
          <button class="tbtn wide" title="Fit to window" @click="fit">Fit</button>
          <button class="tbtn" :title="maxed ? 'Restore size' : 'Maximize'" @click="maxed = !maxed">
            <AppIcon :name="maxed ? 'restore' : 'maximize'" />
          </button>
          <button class="tbtn close" title="Close (Esc)" @click="close">
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
        <span class="resize-hint">↘ drag corner to resize</span>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles/MermaidViewerDialog.css"></style>
