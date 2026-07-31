<script setup>
// Shared band at the top of each sidebar section. The whole header is the
// reorder drag handle (unless locked).
import { computed, ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { useSectionReorder } from '../composables/useSectionReorder'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  sectionId: { type: String, required: true },
  title: { type: String, required: true },
  open: { type: Boolean, default: true },
  icon: { type: String, default: '' }, // per-section AppIcon for identity
  // The topmost section aligns its label with the file-slot row.
  first: { type: Boolean, default: false },
  // Quiet group-label mode: no band fill, drag-reorder, or lock cue.
  unified: { type: Boolean, default: false }
})
defineEmits(['toggle'])

const settings = useSettingsStore()
const { onDragStart, onDragOver, onDragEnd, onDrop, isDropTarget, isDragging, isSettling } =
  useSectionReorder()

const locked = computed(() => settings.sectionsLocked)
const dropTarget = computed(() => isDropTarget(props.sectionId))
const dragging = computed(() => isDragging(props.sectionId))
const settling = computed(() => isSettling(props.sectionId))

// One-shot animation cue when the lock toggles ('' | 'unlock' | 'lock').
const lockCue = ref('')
let cueTimer = null
watch(
  () => settings.sectionsLocked,
  (isLocked) => {
    lockCue.value = isLocked ? 'lock' : 'unlock'
    clearTimeout(cueTimer)
    cueTimer = setTimeout(() => (lockCue.value = ''), 650)
  }
)
</script>

<template>
  <div
    class="head section-head band band-row"
    :class="{
      first,
      unified,
      'drop-target': dropTarget && !unified,
      dragging,
      settling,
      draggable: !locked && !unified,
      'cue-unlock': lockCue === 'unlock',
      'cue-lock': lockCue === 'lock'
    }"
    :data-section="sectionId"
    :draggable="!locked && !unified"
    :data-tip="unified || locked ? null : 'Drag to reorder — lock in the toolbar to freeze'"
    @click="$emit('toggle')"
    @dragstart="onDragStart(sectionId, $event)"
    @dragend="onDragEnd"
    @dragover.prevent="onDragOver(sectionId)"
    @drop.prevent="onDrop(sectionId)"
  >
    <AppIcon class="chev" :class="{ open }" name="chevron-right" />
    <span v-if="icon" class="section-icon"><AppIcon :name="icon" /></span>
    <span class="section-title">{{ title }}</span>
    <span v-if="$slots.actions" class="actions-slot"><slot name="actions" /></span>
  </div>
</template>

<style scoped src="./styles/SectionHeader.css"></style>
