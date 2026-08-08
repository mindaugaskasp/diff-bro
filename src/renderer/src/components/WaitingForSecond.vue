<script setup>
// One side loaded. The old version was two lines of centred prose, which said
// what was missing without SHOWING it. This mirrors the comparison instead: a
// filled slot for what is loaded, an empty dashed one for what is not, in the
// order the panes are in — so the shape of the screen is the instruction.
import AppIcon from './AppIcon.vue'

const props = defineProps({
  name: { type: String, required: true },
  /** Which side is still empty — 'left' or 'right'. */
  missing: { type: String, required: true }
})

const emptyFirst = () => props.missing === 'left'
</script>

<template>
  <div class="empty waiting">
    <div class="wait-slots">
      <div v-if="emptyFirst()" class="wait-slot open">
        <AppIcon name="plus" />
        <span class="wait-label">{{
          $t('app.waiting.dropSide', { side: $t(`common.${missing}`) })
        }}</span>
      </div>
      <div class="wait-slot filled">
        <span class="wait-tag">{{ $t('app.waiting.loaded') }}</span>
        <span class="wait-name">{{ name }}</span>
      </div>
      <span class="wait-vs" aria-hidden="true">↔</span>
      <div v-if="!emptyFirst()" class="wait-slot open">
        <AppIcon name="plus" />
        <span class="wait-label">{{
          $t('app.waiting.dropSide', { side: $t(`common.${missing}`) })
        }}</span>
      </div>
    </div>
    <p class="wait-hint">{{ $t('app.waiting.hint') }}</p>
  </div>
</template>

<style scoped src="./styles/WaitingForSecond.css"></style>
