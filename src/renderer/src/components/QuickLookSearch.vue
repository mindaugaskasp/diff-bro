<script setup>
import { ref } from 'vue'
import { isMac } from '../keys'
import AppIcon from './AppIcon.vue'

// The tip names the key, so reaching for the mouse teaches the shortcut.
const NEW_KEY = isMac ? '⌘N' : 'Ctrl+N'

const query = defineModel('query', { type: String, required: true })
defineEmits(['keydown', 'add'])

const input = ref(null)
defineExpose({
  focus: () => {
    input.value?.focus()
    input.value?.select()
  },
  // Reclaim the keyboard without re-selecting what was typed — used when a
  // click parked focus on a button mid-search.
  reclaim: () => input.value?.focus()
})
</script>

<template>
  <div class="ql-search band drag-band">
    <AppIcon name="search" class="ql-search-ico" />
    <input
      ref="input"
      v-model="query"
      class="ql-input"
      type="text"
      :placeholder="$t('quickLookSearch.searchSnippetsTools')"
      autocomplete="off"
      spellcheck="false"
      @keydown="$emit('keydown', $event)"
    />
    <button
      class="btn btn-icon ql-add"
      :data-tip="$t('quickLookSearch.captureANewSnippet', { key: NEW_KEY })"
      :aria-label="$t('quickLookSearch.newSnippet')"
      @click="$emit('add')"
    >
      <AppIcon name="plus" />
    </button>
  </div>
</template>

<style scoped src="./styles/QuickLookSearch.css"></style>
