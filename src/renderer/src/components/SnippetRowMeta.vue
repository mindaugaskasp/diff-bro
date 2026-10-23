<script setup>
import { useSnippetStore } from '../stores/snippetStore'
import AppIcon from './AppIcon.vue'

defineProps({
  /** @type {import('vue').PropType<string[]>} */
  vars: { type: Array, default: () => [] },
  /** @type {import('vue').PropType<string[]>} */
  tags: { type: Array, default: () => [] }
})

const MAX_TAGS = 3
const store = useSnippetStore()
</script>

<template>
  <span class="row-2-meta snip-meta">
    <span
      v-if="vars.length"
      class="varchip"
      :data-tip="
        $t('snippetRow.placeholderTip', vars.length, {
          named: { n: vars.length, list: vars.join(', ') }
        })
      "
    >
      <AppIcon name="braces" />{{ vars.length }}
    </span>
    <span
      v-for="tag in tags.slice(0, MAX_TAGS)"
      :key="tag"
      class="tag-word"
      :style="{ '--tc': store.colorOf(tag) }"
    >
      <span class="tw-dot"></span>
      <span class="tw-label">{{ tag }}</span>
    </span>
    <span v-if="tags.length > MAX_TAGS" class="tw-more">+{{ tags.length - MAX_TAGS }}</span>
  </span>
</template>

<style scoped src="./styles/SnippetRowMeta.css"></style>
