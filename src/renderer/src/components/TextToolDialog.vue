<script setup>
// The frame around one tool panel: dialog chrome, the title from the shared
// registry, and the panel itself. Every tool is a rich panel now, so there is no
// text-buffer branch — a new tool is a registry entry (utils/tools.js) plus a
// case below, never another dialog component.
import { computed, nextTick, onMounted, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { toolById } from '../utils/tools'
import BaseDialog from './BaseDialog.vue'
import ToolEpoch from './ToolEpoch.vue'
import ToolUuid from './ToolUuid.vue'
import ToolUrl from './ToolUrl.vue'
import ToolJwt from './ToolJwt.vue'
import ToolJson from './ToolJson.vue'
import ToolLines from './ToolLines.vue'
import ToolBase64 from './ToolBase64.vue'
import ToolXml from './ToolXml.vue'
import ToolHash from './ToolHash.vue'
import ToolRegex from './ToolRegex.vue'

const props = defineProps({
  // A tool id from the registry — which panel this dialog is showing.
  tool: { type: String, required: true }
})

const store = useDiffStore()
const title = computed(() => toolById(props.tool)?.name ?? 'Tools')

// Land the caret in the panel's first field, as the launcher does — otherwise
// the first Tab lands on Close and you cannot paste without reaching for a mouse.
const body = ref(null)
onMounted(() => nextTick(() => body.value?.querySelector('input, textarea')?.focus()))

function close() {
  store.textTool = null
}
</script>

<template>
  <BaseDialog width="460px" :close-on-backdrop="false" :title="title" @close="close">
    <div ref="body" class="tt-body">
      <ToolEpoch v-if="tool === 'epoch'" />
      <ToolUuid v-else-if="tool === 'uuid'" />
      <ToolUrl v-else-if="tool === 'url'" />
      <ToolJwt v-else-if="tool === 'jwt'" />
      <ToolJson v-else-if="tool === 'json'" />
      <ToolLines v-else-if="tool === 'lines'" />
      <ToolBase64 v-else-if="tool === 'base64'" />
      <ToolXml v-else-if="tool === 'xml'" />
      <ToolHash v-else-if="tool === 'hash'" />
      <ToolRegex v-else-if="tool === 'regex'" />
    </div>
    <template #actions>
      <button class="btn btn-ghost" @click="close">Close</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/TextToolDialog.css"></style>
