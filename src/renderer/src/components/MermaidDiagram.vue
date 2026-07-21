<script setup>
// Renders a Mermaid diagram from `code`, re-rendering (debounced) as the code or
// the app theme changes. The SVG is inserted with DOMParser + replaceChildren —
// never innerHTML/v-html (ESLint-banned, CLAUDE.md rule 7) — and Mermaid has
// already sanitized it at securityLevel 'strict'.
import { onBeforeUnmount, ref, watch } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { renderMermaid } from '../composables/useMermaid'

const props = defineProps({
  code: { type: String, default: '' },
  // Live typing wants a debounce; the static viewer passes 0 for immediacy.
  debounce: { type: Number, default: 250 }
})
const emit = defineEmits(['rendered', 'error'])

const diff = useDiffStore()
const host = ref(null)
const error = ref('')
const loading = ref(false)
let timer = null
// Guards against an out-of-order finish: a fast edit can start render N+1 while
// N is still awaiting, and only the newest result may touch the DOM.
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
    const svg = await renderMermaid(code, diff.theme)
    if (mine !== renderSeq) return
    // Parse as HTML so <foreignObject> content (if any) is handled, then adopt
    // the <svg> node into this document. No string is ever assigned to innerHTML.
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
  return msg.replace(/^error:\s*/i, '').trim().slice(0, 400) || 'Could not render this diagram.'
}

function schedule() {
  clearTimeout(timer)
  timer = setTimeout(doRender, props.debounce)
}

watch(() => [props.code, diff.theme], schedule, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="mermaid-diagram">
    <div ref="host" class="host" :class="{ hidden: !!error }"></div>
    <p v-if="error" class="err">
      <span class="err-title">Diagram error</span>
      <span class="err-msg">{{ error }}</span>
    </p>
    <span v-if="loading" class="loading">rendering…</span>
  </div>
</template>

<style scoped>
.mermaid-diagram {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 0;
}
.host {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.host.hidden {
  display: none;
}
.host :deep(svg) {
  max-width: 100%;
  max-height: 100%;
  height: auto;
}
.err {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 90%;
  padding: 12px 14px;
  border: 1px solid var(--danger-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--danger-bg) 12%, transparent);
  font-size: 12px;
  color: var(--text);
}
.err-title {
  font-weight: 700;
  color: var(--danger-bg);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.err-msg {
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  line-height: 1.4;
  color: var(--text-dim);
  white-space: pre-wrap;
  word-break: break-word;
}
.loading {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 10.5px;
  color: var(--text-hint);
}
</style>
