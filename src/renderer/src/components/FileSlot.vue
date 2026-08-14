<script setup>
import { computed } from 'vue'
import { shaped } from '../utils/props'
import { isCopyableSide } from '../utils/sideText'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  side: { type: String, required: true },
  /** @type {import('vue').PropType<import('../types').LoadedFile|null>} */
  file: {
    // The slot only reads name/path (a spreadsheet carries sheets, not content).
    type: Object,
    default: null,
    validator: (v) => v === null || shaped('name')(v)
  },
  // True when this slot is empty and the other side already has a file, so we
  // can visibly prompt for the second file.
  awaiting: { type: Boolean, default: false }
})
const emit = defineEmits(['pick', 'copy'])
// A spreadsheet or a streamed side has no text to give, so it gets no control
// at all rather than one that refuses — see utils/sideText.
const copyable = computed(() => isCopyableSide(props.file))
// Drag & drop is window-level (App.vue); the slot just tags itself data-side.
</script>

<template>
  <div class="slot" :class="{ filled: !!file, awaiting, copyable }" :data-side="side">
    <button
      class="open"
      :data-tip="file ? file.path : $t('fileSlot.chooseSideFile', { side })"
      @click="emit('pick')"
    >
      <span v-if="file" class="name">{{ file.name }}</span>
      <span v-else class="placeholder">{{
        awaiting ? `drop the ${side} file here` : `${side} file…`
      }}</span>
    </button>
    <button
      v-if="copyable"
      class="btn btn-icon copy"
      :data-tip="$t('fileSlot.copySide', { name: file.name })"
      :aria-label="$t('fileSlot.copySide', { name: file.name })"
      @click="emit('copy')"
    >
      <AppIcon name="copy" />
    </button>
  </div>
</template>

<style scoped src="./styles/FileSlot.css"></style>
