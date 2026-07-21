<script setup>
// Full-screen-ish, resizable Mermaid viewer. Opened from the snippet editor's
// live preview or a Mermaid snippet row (diffStore.mermaidView). Supports
// zoom (buttons + Ctrl/⌘-wheel), drag-to-pan, Fit, and a maximize toggle; the
// panel itself is CSS-resizable so users can size it to the diagram.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import MermaidDiagram from './MermaidDiagram.vue'

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

function onKey(e) {
  if (e.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="view" class="backdrop" @click.self="close">
    <div class="panel" :class="{ maxed }">
      <div class="head">
        <span class="title">{{ view.name || 'Diagram' }}</span>
        <div class="tools">
          <button class="tbtn" title="Zoom out" @click="zoom(1 / 1.2)">−</button>
          <span class="pct" @click="fit">{{ pct }}%</span>
          <button class="tbtn" title="Zoom in" @click="zoom(1.2)">+</button>
          <button class="tbtn wide" title="Fit to window" @click="fit">Fit</button>
          <button
            class="tbtn"
            :title="maxed ? 'Restore size' : 'Maximize'"
            @click="maxed = !maxed"
          >
            {{ maxed ? '❐' : '⛶' }}
          </button>
          <button class="tbtn close" title="Close (Esc)" @click="close">×</button>
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

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.panel {
  display: flex;
  flex-direction: column;
  width: min(880px, 90vw);
  height: min(620px, 82vh);
  min-width: 360px;
  min-height: 260px;
  max-width: 96vw;
  max-height: 92vh;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  resize: both;
}
.panel.maxed {
  width: 96vw;
  height: 92vh;
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.title {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tools {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tbtn {
  min-width: 26px;
  height: 24px;
  padding: 0 6px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  font-family: inherit;
}
.tbtn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.tbtn.wide {
  font-size: 11px;
}
.tbtn.close {
  font-size: 16px;
}
.pct {
  min-width: 42px;
  text-align: center;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
  cursor: pointer;
  user-select: none;
}
.pct:hover {
  color: var(--accent);
}
.stage {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: none;
  /* A quiet grid so a transparent diagram canvas reads as a surface. */
  background:
    linear-gradient(var(--bg) 0 0) padding-box,
    var(--bg);
}
.stage:active {
  cursor: grabbing;
}
.transform {
  transform-origin: center center;
  transition: transform 0.04s linear;
  max-width: 100%;
  max-height: 100%;
  display: flex;
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 12px;
  border-top: 1px solid var(--border);
  background: var(--bg);
  font-size: 10.5px;
  color: var(--text-hint);
}
</style>
