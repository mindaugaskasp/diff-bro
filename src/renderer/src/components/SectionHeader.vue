<script setup>
// The band at the top of each reorderable sidebar section: a collapse chevron,
// the title, an optional actions slot, and up/down controls that move the whole
// section (persisted in settings). Shared so Saved / External / Snippets read
// and behave identically.
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'

const props = defineProps({
  sectionId: { type: String, required: true },
  title: { type: String, required: true },
  open: { type: Boolean, default: true },
  // The topmost section sits flush and aligns its label with the file-slot row.
  first: { type: Boolean, default: false }
})
defineEmits(['toggle'])

const settings = useSettingsStore()
const index = computed(() => settings.orderedSections.indexOf(props.sectionId))
const canUp = computed(() => index.value > 0)
const canDown = computed(
  () => index.value > -1 && index.value < settings.orderedSections.length - 1
)
</script>

<template>
  <div class="head section-head" :class="{ first }" @click="$emit('toggle')">
    <span class="chev" :class="{ open }">▸</span>
    <span class="section-title">{{ title }}</span>
    <slot name="actions" />
    <span class="reorder">
      <button
        class="reorder-btn"
        :disabled="!canUp"
        title="Move section up"
        @click.stop="settings.moveSection(sectionId, -1)"
      >
        ▲
      </button>
      <button
        class="reorder-btn"
        :disabled="!canDown"
        title="Move section down"
        @click.stop="settings.moveSection(sectionId, 1)"
      >
        ▼
      </button>
    </span>
  </div>
</template>

<style scoped src="./styles/SectionHeader.css"></style>
