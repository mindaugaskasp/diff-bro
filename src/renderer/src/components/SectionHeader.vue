<script setup>
// The band at the top of each reorderable sidebar section: a collapse chevron,
// the title, and an optional actions slot. The whole header is the drag handle
// for reordering (unless locked) — drag-and-drop only, no stepper buttons.
// Shared so Saved / External / Snippets behave identically.
import { computed, ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { useSectionReorder } from '../composables/useSectionReorder'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  sectionId: { type: String, required: true },
  title: { type: String, required: true },
  open: { type: Boolean, default: true },
  // A per-section AppIcon name (folder / share / code …). Distinct silhouettes
  // give each section its own identity, so a reorder reads at a glance without
  // parsing the labels — the whole point of the identity work.
  icon: { type: String, default: '' },
  // The topmost section sits flush and aligns its label with the file-slot row.
  first: { type: Boolean, default: false },
  // In the unified sidebar the header is just a quiet group label — no band fill,
  // no drag-reorder, no lock cue. It still collapses on click.
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

// A one-shot cue whenever the sidebar lock toggles, so the change is obvious:
// unlocking wiggles every header (now draggable), locking snaps them firm.
// '' | 'unlock' | 'lock' — cleared after the animation so it can replay.
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
    :title="unified || locked ? null : 'Drag to reorder — lock in the toolbar to freeze'"
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
