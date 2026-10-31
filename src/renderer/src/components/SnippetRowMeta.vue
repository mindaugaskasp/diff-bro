<script setup>
import { useSnippetStore } from '../stores/snippetStore'
import { TAGS_BEFORE_MORE } from '../utils/snippetState'
import AppIcon from './AppIcon.vue'

defineProps({
  /** @type {import('vue').PropType<string[]>} */
  vars: { type: Array, default: () => [] },
  /** @type {import('vue').PropType<string[]>} */
  tags: { type: Array, default: () => [] }
})

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
      v-for="tag in tags.slice(0, TAGS_BEFORE_MORE)"
      :key="tag"
      class="tag-word"
      :style="{ '--tc': store.colorOf(tag) }"
    >
      <span class="tw-dot"></span>
      <span class="tw-label">{{ tag }}</span>
    </span>
    <span v-if="tags.length > TAGS_BEFORE_MORE" class="tw-more">+{{ tags.length - TAGS_BEFORE_MORE }}</span>
  </span>
</template>

<style scoped src="./styles/SnippetRowMeta.css"></style>
