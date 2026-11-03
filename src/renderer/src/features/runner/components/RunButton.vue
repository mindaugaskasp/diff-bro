<script setup>
import AppIcon from '../../../components/AppIcon.vue'

defineProps({
  // useSnippetRun's return; its refs are unwrapped by the template's reactive read.
  run: { type: Object, required: true }
})
</script>

<template>
  <button
    v-if="run.available.value && run.running.value"
    type="button"
    class="btn btn-sm btn-square"
    :aria-label="$t('runner.stop')"
    :data-tip="$t('runner.stop')"
    @click="run.stop()"
  >
    <AppIcon name="stop" />
  </button>
  <button
    v-else-if="run.available.value"
    type="button"
    class="btn btn-sm btn-square"
    :disabled="run.secret.value || !run.hasCode.value"
    :aria-label="$t('runner.run')"
    :data-tip="run.secret.value ? $t('runner.secretTip') : $t('runner.run')"
    @click="run.start()"
  >
    <AppIcon name="play" />
  </button>
</template>
