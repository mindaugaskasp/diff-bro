<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useCaretBackOut } from '../composables/useCaretBackOut'
import { usePanelScroll } from '../composables/usePanelScroll'
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
  tool: { type: Object, required: true }, // { id, name, panel }
  // The panel stays mounted while the list is showing, so it needs telling.
  visible: { type: Boolean, default: true }
})
const emit = defineEmits(['back'])

// ← mirrors the → that entered the panel (see useCaretBackOut).
const { onKeydown } = useCaretBackOut(() => emit('back'))

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

// Focus a field, or Escape fires on body and never reaches the handler here.
const panelEl = ref(null)
const { onKeydown: onPanelKeys } = usePanelScroll(panelEl)
function focusFirstField() {
  nextTick(() => {
    const field = panelEl.value?.querySelector('input, textarea')
    ;(field ?? panelEl.value)?.focus()
  })
}
onMounted(focusFirstField)
watch(
  () => props.visible,
  (shown) => shown && focusFirstField()
)
</script>

<template>
  <div class="qc" @keydown.escape="$emit('back')" @keydown="onKeydown">
    <div class="qc-head band">
      <button class="btn btn-icon qc-back" data-tip="Back (Esc)" @click="$emit('back')">
        <AppIcon name="chevron-left" />
      </button>
      <AppIcon :name="headIcon" class="qc-ico" />
      <span class="qc-name">{{ tool.name }}</span>
      <span class="qc-kbd">Esc</span>
    </div>

    <div ref="panelEl" class="qc-panel" tabindex="-1" @keydown="onPanelKeys">
      <KeepAlive>
        <ToolEpoch v-if="tool.panel === 'epoch'" compact />
        <ToolUuid v-else-if="tool.panel === 'uuid'" compact />
        <ToolUrl v-else-if="tool.panel === 'url'" compact />
        <ToolJwt v-else-if="tool.panel === 'jwt'" compact />
        <ToolJson v-else-if="tool.panel === 'json'" compact />
        <ToolLines v-else-if="tool.panel === 'lines'" compact />
        <ToolBase64 v-else-if="tool.panel === 'base64'" compact />
        <ToolXml v-else-if="tool.panel === 'xml'" compact />
      </KeepAlive>
    </div>

    <div class="qc-foot band">
      <span class="qc-lock"><AppIcon name="lock" /> stays on this machine</span>
    </div>
  </div>
</template>

<style scoped src="./styles/QuickLookConvert.css"></style>
