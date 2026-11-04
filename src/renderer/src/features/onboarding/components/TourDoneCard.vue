<script setup>
import AppIcon from '../../../components/AppIcon.vue'

defineEmits(['close'])
</script>

<template>
  <div class="tour-done" role="status">
    <p class="td-title">{{ $t('onboarding.core.done.title') }}</p>
    <button
      type="button"
      class="btn btn-icon"
      :aria-label="$t('onboarding.core.done.close')"
      :data-tip="$t('onboarding.core.done.close')"
      @click="$emit('close')"
    >
      <AppIcon name="x" />
    </button>
  </div>
</template>

<style scoped src="./styles/TourDoneCard.css"></style>
