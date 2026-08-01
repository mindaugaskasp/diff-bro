<script setup>
// The sidebar's search row: the box, its clear control, and the button that
// collapses the sidebar to its rail.
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'

defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue', 'collapse'])

const box = ref(null)
defineExpose({ focus: () => box.value?.focus() })
</script>

<template>
  <div class="usb-top">
    <div class="usb-search">
      <AppIcon class="usb-glyph" name="search" />
      <input
        ref="box"
        :value="modelValue"
        type="search"
        placeholder="Search diffs & snippets…"
        spellcheck="false"
        @input="emit('update:modelValue', $event.target.value)"
      />
      <button
        v-if="modelValue"
        class="usb-x"
        data-tip="Clear the search box"
        aria-label="Clear search"
        @click="emit('update:modelValue', '')"
      >
        <AppIcon name="x" />
      </button>
    </div>
    <button
      class="usb-collapse"
      data-tip="Collapse the sidebar"
      aria-label="Collapse the sidebar"
      @click="emit('collapse')"
    >
      <AppIcon name="chevron-left" />
    </button>
  </div>
</template>

<style scoped src="./styles/SidebarSearch.css"></style>
