<script setup>
// The frame around one tool panel: dialog chrome, the title from the shared
// registry, and the panel itself. Every tool is a rich panel now, so there is no
// text-buffer branch — a new tool is a registry entry (utils/tools.js) plus a
// case below, never another dialog component.
import { computed, nextTick, onMounted, ref } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { toolOutput } from '../composables/useToolOutput'
import { toolById } from '../utils/tools'
import { t } from '../i18n'
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
import { useUiStore } from '../stores/uiStore'

const props = defineProps({
  // A tool id from the registry — which panel this dialog is showing.
  tool: { type: String, required: true }
})

const ui = useUiStore()
const snippets = useSnippetStore()
const nameKey = computed(() => toolById(props.tool)?.nameKey)
const title = computed(() => (nameKey.value ? t(nameKey.value) : t('tools.fallbackTitle')))

// Re-read on every render rather than once: a panel's output changes as it is
// typed into, and an empty tool has nothing worth keeping.
const keepable = () => toolOutput()

// The tool closes FIRST — the editor over a tool dialog is two stacked dialogs,
// which the diagram expander already avoids.
function saveAsSnippet() {
  const out = keepable()
  if (!out) return
  close()
  snippets.startNewSnippetFrom(out.text, out.language)
}

// Land the caret in the panel's first field, as the launcher does — otherwise
// the first Tab lands on Close and you cannot paste without reaching for a mouse.
const body = ref(null)
onMounted(() => nextTick(() => body.value?.querySelector('input, textarea')?.focus()))

function close() {
  ui.textTool = null
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
      <button
        v-if="keepable()"
        class="btn"
        :data-tip="$t('textToolDialog.keepThisInYourSnippet')"
        @click="saveAsSnippet"
      >
        {{ $t('textToolDialog.saveAsSnippet') }}
      </button>
      <button class="btn btn-ghost" @click="close">{{ $t('common.close') }}</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/TextToolDialog.css"></style>
