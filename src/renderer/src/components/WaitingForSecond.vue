<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import SingleFileView from './SingleFileView.vue'
import PaneLabels from './PaneLabels.vue'

const props = defineProps({
  name: { type: String, required: true },
  /** Which side is still empty — 'left' or 'right'. */
  missing: { type: String, required: true },
  /** @type {import('vue').PropType<import('../types').TextComparable|import('../types').SpreadsheetComparable|null>} */
  comparable: { type: Object, default: null }
})

const emit = defineEmits(['pick'])

const paneOrder = computed(() =>
  props.missing === 'left' ? ['open', 'loaded'] : ['loaded', 'open']
)
const isViewable = computed(
  () => props.comparable?.kind === 'text' && typeof props.comparable.text === 'string'
)
</script>

<template>
  <div class="waiting">
    <PaneLabels class="waiting-labels" />
    <template v-for="pane in paneOrder" :key="pane">
      <section v-if="pane === 'loaded'" class="wait-pane loaded">
        <SingleFileView v-if="isViewable" :comparable="comparable" />
        <div v-else class="wait-slot filled">
          <span class="wait-tag">{{ $t('app.waiting.loaded') }}</span>
          <span class="wait-name">{{ name }}</span>
        </div>
      </section>
      <section v-else class="wait-pane open">
        <button
          type="button"
          class="wait-slot open"
          :aria-label="$t('app.waiting.chooseSide', { side: $t(`common.${missing}`) })"
          @click="emit('pick', missing)"
        >
          <AppIcon name="plus" />
          <span class="wait-title">{{ $t('app.waiting.title') }}</span>
          <span class="wait-label">{{
            $t('app.waiting.dropSide', { side: $t(`common.${missing}`) })
          }}</span>
        </button>
        <p class="wait-hint">{{ $t('app.waiting.hint') }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped src="./styles/WaitingForSecond.css"></style>
