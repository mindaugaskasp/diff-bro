<script setup>
// The launcher's search band. Its own component so QuickLook.vue's template
// stays within its cap, and because compose mode takes the band away entirely.
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'

const query = defineModel('query', { type: String, required: true })
// Read-only rather than blurred or hidden: the arrow-key driver hangs off this
// input's @keydown, so losing focus here would kill navigation outright.
defineProps({ readonly: { type: Boolean, default: false } })
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
  <div class="ql-search band" :class="{ parked: readonly }">
    <AppIcon name="search" class="ql-search-ico" />
    <input
      ref="input"
      v-model="query"
      class="ql-input"
      type="text"
      placeholder="Search snippets & tools…"
      autocomplete="off"
      spellcheck="false"
      :readonly="readonly"
      @keydown="$emit('keydown', $event)"
    />
    <button
      class="btn btn-icon ql-add"
      data-tip="Capture a new plaintext snippet"
      aria-label="New plaintext snippet"
      @click="$emit('add')"
    >
      <AppIcon name="plus" />
    </button>
    <span class="ql-kbd">Esc</span>
  </div>
</template>

<style scoped src="./styles/QuickLookSearch.css"></style>
