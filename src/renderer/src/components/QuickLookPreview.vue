<script setup>
// The launcher's preview pane for a selected row. Split out of QuickLook.vue so
// that file stays inside its script cap without hand-compacting anything.
// Renders via interpolation, never v-html (#8).
import { computed } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { t } from '../i18n'
import AppIcon from './AppIcon.vue'
import QuickLookPreviewHead from './QuickLookPreviewHead.vue'
import QuickLookToolHint from './QuickLookToolHint.vue'

const props = defineProps({
  current: { type: Object, required: true },
  copied: { type: Boolean, default: false },
  copyKey: { type: String, required: true },
  canEdit: { type: Boolean, default: false },
  snippetSpans: { type: Array, default: () => [] },
  lineClass: { type: Function, required: true },
  hoverLine: { type: Function, required: true },
  // usePreviewLines scrolls this element but the composable belongs to the
  // PARENT, so the node has to reach back up: a callback ref does it without
  // the child writing through a prop.
  setScrollEl: { type: Function, required: true }
})
const zone = defineModel('zone', { type: String, required: true })
defineEmits(['copy', 'edit', 'choose'])

const store = useSnippetStore()

// A tool speaks for itself (its own icon and action word), so the button never
// says a blanket "Convert" over one that formats or generates. Null for a kind
// with no action: reading `.icon` off undefined took the whole pane down once.
const ACTIONS = {
  snippet: { icon: 'edit', key: 'quickLook.action.openInEditor' },
  tools: { icon: 'wrench', key: 'quickLook.action.browseTools' },
  create: { icon: 'plus', key: 'quickLook.action.createSnippet' }
}
const action = computed(() => {
  const it = props.current
  if (it.kind === 'command') return { icon: it.icon, label: it.action }
  const a = ACTIONS[it.kind]
  return a ? { icon: a.icon, label: t(a.key) } : null
})
</script>

<template>
  <QuickLookPreviewHead
    v-model:zone="zone"
    :current="current"
    :copied="copied"
    :copy-key="copyKey"
    :can-edit="canEdit"
    @copy="$emit('copy')"
    @edit="$emit('edit')"
  />
  <div v-if="current.tags?.length" class="ql-pv-tags">
    <span
      v-for="tag in current.tags"
      :key="tag"
      class="tag-word"
      :style="{ '--tc': store.colorOf(tag) }"
    >
      <span class="tw-dot"></span>
      <span class="tw-label">{{ tag }}</span>
    </span>
  </div>

  <div
    v-if="current.kind === 'snippet'"
    :ref="setScrollEl"
    class="ql-pv-body"
    :class="{ scrolling: zone === 'preview' }"
    @mouseover="hoverLine"
  >
    <div v-for="(spans, i) in snippetSpans" :key="i" :class="lineClass(i)">
      <span v-for="(span, j) in spans" :key="j" :class="span.role && `syn-${span.role}`">{{
        span.text
      }}</span>
    </div>
  </div>
  <QuickLookToolHint v-else :kind="current.kind" :count="current.count" />

  <div class="ql-pv-foot band">
    <span class="ql-pv-actions">
      <button v-if="action" class="btn btn-primary btn-sm" @click="$emit('choose')">
        <AppIcon :name="action.icon" /> {{ action.label }}
      </button>
    </span>
  </div>
</template>

<style scoped src="./styles/QuickLook.css"></style>
