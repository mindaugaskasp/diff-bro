<script setup>
// Navigation and the four answers, for the region the reader is on.
import AppIcon from '../../../components/AppIcon.vue'

defineProps({
  remaining: { type: Number, required: true },
  disabled: { type: Boolean, default: false }
})
defineEmits(['step', 'take', 'all'])

const TAKE = [
  { value: 'ours', labelKey: 'merge.takeOurs' },
  { value: 'theirs', labelKey: 'merge.takeTheirs' },
  { value: 'both', labelKey: 'merge.takeBoth' },
  { value: 'neither', labelKey: 'merge.takeNeither' }
]
</script>

<template>
  <span class="merge-actions">
    <button
      class="btn btn-sm"
      :disabled="disabled"
      :data-tip="$t('merge.prevTip')"
      :aria-label="$t('merge.prevTip')"
      data-testid="merge-prev"
      @click="$emit('step', -1)"
    >
      <AppIcon name="chevron-up" />
    </button>
    <button
      class="btn btn-sm"
      :disabled="disabled"
      :data-tip="$t('merge.nextTip')"
      :aria-label="$t('merge.nextTip')"
      data-testid="merge-next"
      @click="$emit('step', 1)"
    >
      <AppIcon name="chevron-down" />
    </button>
    <span class="merge-count">{{ $t('merge.remaining', remaining) }}</span>
    <button
      v-for="t in TAKE"
      :key="t.value"
      class="btn btn-sm"
      :disabled="disabled"
      :data-testid="`merge-take-${t.value}`"
      @click="$emit('take', t.value)"
    >
      {{ $t(t.labelKey) }}
    </button>
    <button
      class="btn btn-sm"
      :disabled="disabled"
      data-testid="merge-all-ours"
      @click="$emit('all', 'ours')"
    >
      {{ $t('merge.allOurs') }}
    </button>
    <button
      class="btn btn-sm"
      :disabled="disabled"
      data-testid="merge-all-theirs"
      @click="$emit('all', 'theirs')"
    >
      {{ $t('merge.allTheirs') }}
    </button>
  </span>
</template>
