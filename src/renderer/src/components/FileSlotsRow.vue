<script setup>
// The two files being compared, and the swap between them.
import { useDiffStore } from '../stores/diffStore'
import FileSlot from './FileSlot.vue'
import AppIcon from './AppIcon.vue'
import { MOD } from '../keys'

const store = useDiffStore()
</script>

<template>
  <div class="file-slots-row band band-row" data-tour="slots">
    <div class="slot-half">
      <FileSlot
        side="left"
        :file="store.left"
        :awaiting="!store.left && !!store.right"
        @pick="store.pick('left')"
        @copy="store.copySide('left')"
      />
    </div>
    <button
      class="btn swap"
      :data-tip="$t('app.swapTip', { mod: MOD })"
      :aria-label="$t('app.swapSides')"
      :disabled="!store.ready"
      @click="store.swap"
    >
      <AppIcon name="swap" />
    </button>
    <div class="slot-half">
      <FileSlot
        side="right"
        :file="store.right"
        :awaiting="!store.right && !!store.left"
        @pick="store.pick('right')"
        @copy="store.copySide('right')"
      />
    </div>
  </div>
</template>

<style scoped src="./styles/FileSlotsRow.css"></style>
