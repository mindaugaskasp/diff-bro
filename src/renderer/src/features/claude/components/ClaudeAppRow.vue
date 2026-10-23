<script setup>
import { computed } from 'vue'
import AppIcon from '../../../components/AppIcon.vue'
import { shaped } from '../../../utils/props'

const props = defineProps({
  labelKey: { type: String, required: true },
  /** @type {import('vue').PropType<import('../../../types').ClaudeAppState>} */
  state: { type: Object, required: true, validator: shaped('available', 'status') },
  busy: { type: Boolean, default: false },
  resultKey: { type: String, default: '' }
})
defineEmits(['connect'])

const STATUS_KEYS = {
  absent: 'claude.settings.statusAbsent',
  current: 'claude.settings.statusCurrent',
  stale: 'claude.settings.statusStale',
  unknown: 'claude.settings.statusUnknown'
}
const statusKey = computed(() =>
  props.state.available ? STATUS_KEYS[props.state.status] : 'claude.settings.notInstalled'
)
const canConnect = computed(
  () => props.state.available && ['absent', 'stale'].includes(props.state.status)
)
</script>

<template>
  <div class="app-row">
    <span class="app-name">{{ $t(labelKey) }}</span>
    <span class="app-status" :class="{ ok: state.available && state.status === 'current' }">
      <AppIcon v-if="state.available && state.status === 'current'" name="check" />
      {{ $t(statusKey) }}
    </span>
    <button
      v-if="canConnect"
      type="button"
      class="btn btn-sm"
      :disabled="busy"
      @click="$emit('connect')"
    >
      {{
        $t(state.status === 'stale' ? 'claude.settings.updateApp' : 'claude.settings.connectApp')
      }}
    </button>
  </div>
  <p v-if="resultKey" class="app-result" role="status">{{ $t(resultKey) }}</p>
</template>

<style scoped src="./styles/ClaudeSetup.css"></style>
