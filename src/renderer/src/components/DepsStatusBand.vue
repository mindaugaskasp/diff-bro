<script setup>
import { shaped } from '../utils/props'

defineProps({
  /** @type {import('vue').PropType<object>} the diffLocks result */
  result: {
    type: Object,
    required: true,
    validator: shaped('stats', 'rows', 'directCount', 'knowsDirect')
  }
})
</script>

<template>
  <div class="status-band">
    <span>
      {{ $t('depsDiffViewer.changed') }}
      <span class="add">{{ $t('count.added', result.stats.added) }}</span> ·
      <span class="del">{{ $t('count.removed', result.stats.removed) }}</span> ·
      <span class="chg">{{ $t('depsDiffViewer.countBumped', result.stats.bumped) }}</span>
    </span>
    <span v-if="result.stats.downgraded" class="del">
      {{ $t('depsDiffViewer.countDowngraded', result.stats.downgraded) }}
    </span>
    <span v-if="result.knowsDirect">
      {{ $t('depsDiffViewer.askedFor') }}
      <span class="chg">{{ result.directCount }}</span>
    </span>
    <span class="band-end">
      <span>{{ $t('count.packages', result.rows.length) }}</span>
    </span>
  </div>
</template>
