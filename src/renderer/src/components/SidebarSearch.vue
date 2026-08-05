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
    <div class="field-search" data-tour="search">
      <AppIcon name="search" />
      <input
        ref="box"
        :value="modelValue"
        type="search"
        :placeholder="$t('sidebarSearch.searchDiffsSnippets')"
        spellcheck="false"
        @input="emit('update:modelValue', $event.target.value)"
      />
      <button
        v-if="modelValue"
        :data-tip="$t('sidebarSearch.clearTheSearchBox')"
        :aria-label="$t('sidebarSearch.clearSearch')"
        @click="emit('update:modelValue', '')"
      >
        <AppIcon name="x" />
      </button>
    </div>
    <button
      class="btn btn-icon sidebar-toggle"
      :data-tip="$t('sidebarSearch.collapseTheSidebar')"
      :aria-label="$t('sidebarSearch.collapseTheSidebar')"
      @click="emit('collapse')"
    >
      <AppIcon name="chevron-left" />
    </button>
  </div>
</template>

<style scoped src="./styles/SidebarSearch.css"></style>
