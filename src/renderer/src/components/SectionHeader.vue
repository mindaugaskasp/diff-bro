<script setup>
// The band at the top of each reorderable sidebar section: a collapse chevron,
// the title, an optional actions slot, and up/down steppers. The whole header is
// the drag handle for reordering (unless locked); the single lock lives in the
// top toolbar, not here. Shared so Saved / External / Snippets behave identically.
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { useSectionReorder } from '../composables/useSectionReorder'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  sectionId: { type: String, required: true },
  title: { type: String, required: true },
  open: { type: Boolean, default: true },
  // The topmost section sits flush and aligns its label with the file-slot row.
  first: { type: Boolean, default: false }
})
defineEmits(['toggle'])

const settings = useSettingsStore()
const { onDragStart, onDragEnd, onDrop, isDropTarget } = useSectionReorder()

const locked = computed(() => settings.sectionsLocked)
const index = computed(() => settings.orderedSections.indexOf(props.sectionId))
const canUp = computed(() => !locked.value && index.value > 0)
const canDown = computed(
  () => !locked.value && index.value > -1 && index.value < settings.orderedSections.length - 1
)
const dropTarget = computed(() => isDropTarget(props.sectionId))
</script>

<template>
  <div
    class="head section-head band band-row"
    :class="{ first, 'drop-target': dropTarget, draggable: !locked }"
    :draggable="!locked"
    :title="locked ? null : 'Drag to reorder — lock in the toolbar to freeze'"
    @click="$emit('toggle')"
    @dragstart="onDragStart(sectionId, $event)"
    @dragend="onDragEnd"
    @dragover.prevent
    @drop.prevent="onDrop(sectionId)"
  >
    <AppIcon class="chev" :class="{ open }" name="chevron-right" />
    <span class="section-title">{{ title }}</span>
    <span v-if="$slots.actions" class="actions-slot"><slot name="actions" /></span>
    <span v-if="!locked" class="reorder">
      <button
        class="reorder-btn"
        :disabled="!canUp"
        title="Move section up"
        @click.stop="settings.moveSection(sectionId, -1)"
      >
        <AppIcon name="chevron-up" />
      </button>
      <button
        class="reorder-btn"
        :disabled="!canDown"
        title="Move section down"
        @click.stop="settings.moveSection(sectionId, 1)"
      >
        <AppIcon name="chevron-down" />
      </button>
    </span>
  </div>
</template>

<style scoped src="./styles/SectionHeader.css"></style>
