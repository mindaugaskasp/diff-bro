<script setup>
// One side loaded. The old version was two lines of centred prose, which said
// what was missing without SHOWING it. This mirrors the comparison instead: a
// filled slot for what is loaded, an empty dashed one for what is not, in the
// order the panes are in — so the shape of the screen is the instruction.
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  name: { type: String, required: true },
  /** Which side is still empty — 'left' or 'right'. */
  missing: { type: String, required: true }
})

const emit = defineEmits(['pick', 'clear'])

// A list, not two mirrored `v-if` branches: the separator sat at a fixed
// position between them, so a missing LEFT put it after both.
const slotOrder = computed(() =>
  props.missing === 'left' ? ['open', 'filled'] : ['filled', 'open']
)
</script>

<template>
  <div class="empty waiting">
    <div class="wait-slots">
      <template v-for="(slot, i) in slotOrder" :key="slot">
        <span v-if="i" class="wait-vs" aria-hidden="true">↔</span>
        <button
          v-if="slot === 'open'"
          type="button"
          class="wait-slot open"
          :aria-label="$t('app.waiting.chooseSide', { side: $t(`common.${missing}`) })"
          @click="emit('pick', missing)"
        >
          <AppIcon name="plus" />
          <span class="wait-label">{{
            $t('app.waiting.dropSide', { side: $t(`common.${missing}`) })
          }}</span>
        </button>
        <div v-else class="wait-slot filled">
          <span class="wait-tag">{{ $t('app.waiting.loaded') }}</span>
          <span class="wait-name">{{ name }}</span>
        </div>
      </template>
    </div>
    <p class="wait-hint">{{ $t('app.waiting.hint') }}</p>
    <!-- A wrong first file was a dead end: the open slot only fills the OTHER
         side. The accessible name is distinct from the toolbar's own Clear,
         which two controls sharing would make ambiguous to every test. -->
    <button
      type="button"
      class="btn btn-sm wait-clear"
      :data-tip="$t('app.waiting.clearTip')"
      :aria-label="$t('app.waiting.clearLabel')"
      @click="emit('clear')"
    >
      {{ $t('app.waiting.clear') }}
    </button>
  </div>
</template>

<style scoped src="./styles/WaitingForSecond.css"></style>
