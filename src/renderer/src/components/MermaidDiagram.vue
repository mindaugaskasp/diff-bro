<script setup>
// The SVG is inserted with DOMParser + replaceChildren, never innerHTML/v-html
// (rule 7); Mermaid already sanitized it at securityLevel 'strict'.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSettingsStore } from '../stores/settingsStore'
import { diagramPaperFor, effectiveDiagramMode } from '../utils/mermaid'
import { renderMermaid } from '../composables/useMermaid'

const props = defineProps({
  code: { type: String, default: '' },
  // Live typing wants a debounce; the static viewer passes 0 for immediacy.
  debounce: { type: Number, default: 250 }
})
const emit = defineEmits(['rendered', 'error'])

const diff = useDiffStore()
const settings = useSettingsStore()
const host = ref(null)
const error = ref('')
const loading = ref(false)
const mode = computed(() => effectiveDiagramMode(diff.theme, settings.diagramTheme))
// Set only when pinned against the app's ground: Mermaid's light theme draws
// dark text, so it has to bring its own paper.
const paper = computed(() => diagramPaperFor(diff.theme, settings.diagramTheme))
let timer = null
// Only the newest render may touch the DOM (a fast edit can outrace an old one).
let renderSeq = 0

async function doRender() {
  const code = props.code.trim()
  if (!code) {
    host.value?.replaceChildren()
    error.value = ''
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
