<script setup>
// One side loaded. The old version was two lines of centred prose, which said
// what was missing without SHOWING it. This mirrors the comparison instead: a
// filled slot for what is loaded, an empty dashed one for what is not, in the
// order the panes are in — so the shape of the screen is the instruction.
import { useDiffStore } from '../stores/diffStore'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  name: { type: String, required: true },
  /** Which side is still empty — 'left' or 'right'. */
  missing: { type: String, required: true }
})

// The slot knows which side it is; making the parent wire that back was one
// more place for the two to disagree.
const pick = () => useDiffStore().pick(props.missing)
const emptyFirst = () => props.missing === 'left'
</script>

<template>
  <div class="empty waiting">
    <div class="wait-slots">
      <button
        v-if="emptyFirst()"
        type="button"
        class="wait-slot open"
        :aria-label="$t('app.waiting.chooseSide', { side: $t(`common.${missing}`) })"
        @click="pick"
      >
        <AppIcon name="plus" />
        <span class="wait-label">{{
          $t('app.waiting.dropSide', { side: $t(`common.${missing}`) })
        }}</span>
      </button>
      <div class="wait-slot filled">
        <span class="wait-tag">{{ $t('app.waiting.loaded') }}</span>
        <span class="wait-name">{{ name }}</span>
      </div>
      <span class="wait-vs" aria-hidden="true">↔</span>
      <button
        v-if="!emptyFirst()"
        type="button"
        class="wait-slot open"
        :aria-label="$t('app.waiting.chooseSide', { side: $t(`common.${missing}`) })"
        @click="pick"
      >
        <AppIcon name="plus" />
        <span class="wait-label">{{
          $t('app.waiting.dropSide', { side: $t(`common.${missing}`) })
        }}</span>
      </button>
    </div>
    <p class="wait-hint">{{ $t('app.waiting.hint') }}</p>
  </div>
</template>

<style scoped src="./styles/WaitingForSecond.css"></style>
