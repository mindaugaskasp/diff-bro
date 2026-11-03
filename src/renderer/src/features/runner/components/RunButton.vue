<script setup>
import AppIcon from '../../../components/AppIcon.vue'
import { shaped } from '../../../utils/props'

defineProps({
  /** @type {import('vue').PropType<import('../../../types').SnippetRun>} */
  snippetRun: {
    type: Object,
    required: true,
    validator: shaped('canRun', 'isRunning', 'start', 'stop')
  }
})
</script>

<template>
  <button
    v-if="snippetRun.canRun.value && snippetRun.isRunning.value"
    type="button"
    class="btn btn-sm btn-square"
    :aria-label="$t('runner.stop')"
    :data-tip="$t('runner.stop')"
    @click="snippetRun.stop()"
  >
    <AppIcon name="stop" />
  </button>
  <button
    v-else-if="snippetRun.canRun.value"
    type="button"
    class="btn btn-sm btn-square"
    :disabled="snippetRun.isSecret.value || !snippetRun.hasCode.value"
    :aria-label="$t('runner.run')"
    :data-tip="snippetRun.isSecret.value ? $t('runner.secretTip') : $t('runner.run')"
    @click="snippetRun.start()"
  >
    <AppIcon name="play" />
  </button>
</template>
