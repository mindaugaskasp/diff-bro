<script setup>
import { computed, ref } from 'vue'
import { shaped } from '../../../utils/props'
import { COACH_W, coachPlacement } from '../coachPlacement'

const props = defineProps({
  /** @type {import('vue').PropType<import('../../../types').TourStep>} */
  step: { type: Object, required: true, validator: shaped('id', 'titleKey', 'bodyKey') },
  labelKey: { type: String, required: true },
  number: { type: Number, required: true },
  count: { type: Number, required: true },
  /** @type {import('vue').PropType<import('../../../types').ScreenRect>} */
  rect: { type: Object, required: true, validator: shaped('x', 'y', 'w', 'h') },
  keys: { type: Array, default: () => [] }
})
defineEmits(['skip', 'action'])

const root = ref(null)
const FALLBACK_H = 140
const place = computed(() =>
  coachPlacement({
    rect: props.rect,
    side: props.step.side,
    height: root.value?.offsetHeight || FALLBACK_H,
    stage: { w: window.innerWidth, h: window.innerHeight }
  })
)
const px = (n) => `${Math.round(n)}px`
const style = computed(() => ({
  left: px(place.value.left),
  top: px(place.value.top),
  width: px(COACH_W)
}))
const pointerStyle = computed(() =>
  place.value.pointer === 'up' ? { left: px(place.value.offset) } : { top: px(place.value.offset) }
)
const braced = (token) => `{{${token}}}`
</script>

<template>
  <div
    ref="root"
    class="coach-mark"
    :class="`points-${place.pointer}`"
    :style="style"
    role="status"
    aria-live="polite"
  >
    <span
      v-if="place.pointer !== 'none'"
      class="cm-pointer"
      :style="pointerStyle"
      aria-hidden="true"
    ></span>
    <div class="cm-head">
      <p class="cm-label">{{ $t(labelKey, { step: number, count }) }}</p>
      <button type="button" class="btn btn-sm btn-ghost cm-skip" @click="$emit('skip')">
        {{ $t('onboarding.skip') }}
      </button>
    </div>
    <p class="cm-title">{{ $t(step.titleKey) }}</p>
    <i18n-t :keypath="step.bodyKey" tag="p" class="cm-body">
      <template #keys>
        <span class="cm-keys">
          <kbd v-for="key in keys" :key="key" class="ql-kbd">{{ key }}</kbd>
        </span>
      </template>
      <template v-for="token in step.tokens ?? []" #[token] :key="token">
        <kbd class="ql-kbd cm-token">{{ braced(token) }}</kbd>
      </template>
      <template v-if="step.nameKey" #name>
        <strong class="cm-name">{{ $t(step.nameKey) }}</strong>
      </template>
    </i18n-t>
    <p v-if="step.actionKey" class="cm-actions">
      <button type="button" class="link-btn cm-link" @click="$emit('action')">
        {{ $t(step.actionKey) }}
      </button>
    </p>
  </div>
</template>

<style scoped src="./styles/CoachMark.css"></style>
