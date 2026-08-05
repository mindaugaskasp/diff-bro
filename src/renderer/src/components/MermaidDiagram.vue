<script setup>
// The SVG is inserted with DOMParser + replaceChildren, never innerHTML/v-html
// (rule 7); Mermaid already sanitized it at securityLevel 'strict'.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { diagramPaperFor, effectiveDiagramMode } from '../utils/mermaid'
import { renderMermaid } from '../composables/useMermaid'

const props = defineProps({
  code: { type: String, default: '' },
  // Live typing wants a debounce; the static viewer passes 0 for immediacy.
  debounce: { type: Number, default: 250 },
  // Per-viewing ground ('auto' | 'light' | 'dark'). Empty means Auto: follow the
  // app. The control is a choice about THIS diagram, so it lives with the dialog
  // and is never persisted — a stored one silently re-themed every diagram after
  // it, on every future launch.
  theme: { type: String, default: '' }
})
const emit = defineEmits(['rendered', 'error'])
const settings = useSettingsStore()
const host = ref(null)
const error = ref('')
const loading = ref(false)
const mode = computed(() => effectiveDiagramMode(settings.theme, props.theme || 'auto'))
// The mode the SVG ON SCREEN was drawn for, which lags `mode` by one async
// render. The paper is computed from THAT, not from the preference: flipping the
// ground the moment the button is pressed leaves the old diagram — drawn for the
// opposite ground — sitting on the new sheet for a few hundred ms. Deriving it
// from the painted mode also keeps an app-theme flip correct with no re-render.
const painted = ref(mode.value)
const paper = computed(() => diagramPaperFor(settings.theme, painted.value))
let timer = null
// Only the newest render may touch the DOM (a fast edit can outrace an old one).
let renderSeq = 0

async function doRender() {
  const code = props.code.trim()
  if (!code) {
    host.value?.replaceChildren()
    error.value = ''
    painted.value = mode.value
    return
  }
  const mine = ++renderSeq
  loading.value = true
  try {
    const svg = await renderMermaid(code, mode.value)
    if (mine !== renderSeq) return
    // Adopt the <svg> node; no string is ever assigned to innerHTML.
    const parsed = new DOMParser().parseFromString(svg, 'text/html')
    const svgEl = parsed.body.querySelector('svg')
    if (!svgEl) throw new Error('No diagram was produced.')
    svgEl.removeAttribute('width') // let CSS own the width so it scales to fit
    svgEl.removeAttribute('height')
    host.value?.replaceChildren(document.importNode(svgEl, true))
    painted.value = mode.value
    error.value = ''
    emit('rendered')
  } catch (e) {
    if (mine !== renderSeq) return
    host.value?.replaceChildren()
    error.value = cleanError(e)
    emit('error', error.value)
  } finally {
    if (mine === renderSeq) loading.value = false
  }
}

// Mermaid errors are prefixed and can be long; trim to a readable hint.
function cleanError(e) {
  const msg = e?.message ? e.message : String(e)
  return (
    msg
      .replace(/^error:\s*/i, '')
      .trim()
      .slice(0, 400) || 'Could not render this diagram.'
  )
}

function schedule() {
  clearTimeout(timer)
  timer = setTimeout(doRender, props.debounce)
}

// Keyed on the RESOLVED mode, so a pinned diagram doesn't re-render on a theme flip.
watch(() => [props.code, mode.value], schedule, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="mermaid-diagram">
    <div ref="host" class="host" :class="{ hidden: !!error }" :data-paper="paper || null"></div>
    <p v-if="error" class="err">
      <span class="err-title">Diagram error</span>
      <span class="err-msg">{{ error }}</span>
    </p>
    <span v-if="loading" class="loading">rendering…</span>
  </div>
</template>

<style scoped src="./styles/MermaidDiagram.css"></style>
