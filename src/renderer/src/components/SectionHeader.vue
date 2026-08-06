<script setup>
// Shared band at the top of each sidebar section. The whole header is the
// reorder drag handle.
import { computed } from 'vue'
import { useSectionReorder } from '../composables/useSectionReorder'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  sectionId: { type: String, required: true },
  title: { type: String, required: true },
  open: { type: Boolean, default: true },
  icon: { type: String, default: '' }, // per-section AppIcon for identity
  // The topmost section aligns its label with the file-slot row.
  first: { type: Boolean, default: false },
  // Quiet group-label mode: no band fill.
  unified: { type: Boolean, default: false },
  // How many rows survived the search/tag filter. Shown only while one is on:
  // a resting sidebar does not need every section counting itself, but a
  // filtered one has to say where the matches are — including the sections
  // that have none, which is the answer to "why is this empty".
  count: { type: Number, default: null },
  filtering: { type: Boolean, default: false }
})
const {
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onCancel,
  consumeClickSuppression,
  isDropTarget,
  isDragging,
  isSettling
} = useSectionReorder()

const emit = defineEmits(['toggle'])
// The click that ends a drag is the drag's own, not a request to collapse.
const onClick = () => {
  if (!consumeClickSuppression()) emit('toggle')
}

const dropTarget = computed(() => isDropTarget(props.sectionId))
const dragging = computed(() => isDragging(props.sectionId))
const settling = computed(() => isSettling(props.sectionId))
</script>

<template>
  <div
    class="head section-head band band-row draggable"
    :class="{
      first,
      unified,
      'drop-target': dropTarget,
      dragging,
      settling
    }"
    :data-section="sectionId"
    data-tip="Drag to reorder"
    @click="onClick"
    @dragstart.prevent
    @pointerdown="onPointerDown(sectionId, $event)"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onCancel"
  >
    <AppIcon class="chev" :class="{ open }" name="chevron-right" />
    <span v-if="icon" class="section-icon"><AppIcon :name="icon" /></span>
    <span class="section-title">{{ title }}</span>
    <span v-if="filtering && count !== null" class="section-count" :class="{ none: count === 0 }">
      {{ count }}
    </span>
    <span v-if="$slots.actions" class="actions-slot"><slot name="actions" /></span>
  </div>
</template>

<style scoped src="./styles/SectionHeader.css"></style>
