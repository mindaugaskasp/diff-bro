<script setup>
// Reusable segmented control — the shared tool-kit primitive for a one-of-N
// choice. `options` is [{ value, label }]; the picked value is v-model:value.
defineProps({
  label: { type: String, default: '' },
  options: { type: Array, required: true }
})
const model = defineModel('value', { type: String, required: true })
</script>

<template>
  <div class="seg-field">
    <span v-if="label" class="seg-label">{{ label }}</span>
    <div class="seg" role="group" :aria-label="label || undefined">
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        class="seg-opt"
        :class="{ on: model === opt.value }"
        :aria-pressed="model === opt.value"
        @click="model = opt.value"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/SegmentedControl.css"></style>
