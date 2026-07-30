<script setup>
// Inline tool panel for the Quick Look launcher: run a tool and copy its result
// without ever raising the app. Every tool is a rich panel (each owns its input,
// output and copy button), so this component is just the frame around one —
// header, the panel itself, and the offline note.
import { computed, nextTick, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import ToolEpoch from './ToolEpoch.vue'
import ToolUuid from './ToolUuid.vue'
import ToolUrl from './ToolUrl.vue'
import ToolJwt from './ToolJwt.vue'
import ToolJson from './ToolJson.vue'
import ToolLines from './ToolLines.vue'
import ToolBase64 from './ToolBase64.vue'
import ToolXml from './ToolXml.vue'

const props = defineProps({
  tool: { type: Object, required: true } // { id, name, panel }
})
defineEmits(['back'])

const PANEL_ICONS = {
  epoch: 'clock',
  uuid: 'hash',
  url: 'link',
  jwt: 'shield-check',
  json: 'braces',
  lines: 'list',
  base64: 'binary',
  xml: 'code'
}
const headIcon = computed(() => PANEL_ICONS[props.tool.panel] || 'wrench')

// Land the caret in the panel's first field so you can type straight away — and
// so Escape has somewhere inside .qc to bubble from (on body it never reaches
// the handler, leaving the panel with no keyboard way out).
const panelEl = ref(null)
onMounted(() =>
  nextTick(() => {
    const field = panelEl.value?.querySelector('input, textarea')
    ;(field ?? panelEl.value)?.focus()
  })
)
</script>

<template>
  <div class="qc" @keydown.escape="$emit('back')">
    <div class="qc-head band">
      <button class="qc-back" title="Back (Esc)" @click="$emit('back')">
        <AppIcon name="chevron-left" />
      </button>
      <AppIcon :name="headIcon" class="qc-ico" />
      <span class="qc-name">{{ tool.name }}</span>
      <span class="qc-kbd">Esc</span>
    </div>

    <div ref="panelEl" class="qc-panel" tabindex="-1">
      <ToolEpoch v-if="tool.panel === 'epoch'" compact />
      <ToolUuid v-else-if="tool.panel === 'uuid'" compact />
      <ToolUrl v-else-if="tool.panel === 'url'" compact />
      <ToolJwt v-else-if="tool.panel === 'jwt'" compact />
      <ToolJson v-else-if="tool.panel === 'json'" compact />
      <ToolLines v-else-if="tool.panel === 'lines'" compact />
      <ToolBase64 v-else-if="tool.panel === 'base64'" compact />
      <ToolXml v-else-if="tool.panel === 'xml'" compact />
    </div>

    <div class="qc-foot band">
      <span class="qc-lock"><AppIcon name="lock" /> stays on this machine</span>
    </div>
  </div>
</template>

<style scoped src="./styles/QuickLookConvert.css"></style>
