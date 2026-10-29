<script setup>
// Reusable segmented control — the shared tool-kit primitive for a one-of-N
// choice. `options` is [{ value, label, icon?, badge?, badgeLabel? }]; an icon
// option draws its glyph and keeps the label as its name. The picked value is v-model:value.
import AppIcon from './AppIcon.vue'

defineProps({
  label: { type: String, default: '' },
  options: { type: Array, required: true },
  // Dense toolbar row: pinned to --control-h-sm, not grown from its padding.
  compact: { type: Boolean, default: false }
})
const model = defineModel('value', { type: String, required: true })
</script>

<template>
  <div class="seg-field">
    <span v-if="label" class="seg-label">{{ label }}</span>
    <div class="seg" :class="{ compact }" role="group" :aria-label="label || undefined">
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        class="seg-opt"
        :class="{ on: model === opt.value }"
        :aria-pressed="model === opt.value"
        :data-value="opt.value"
        :aria-label="opt.icon ? (opt.badgeLabel ?? opt.label) : undefined"
        :data-tip="opt.icon ? opt.label : undefined"
        @click="model = opt.value"
      >
        <AppIcon v-if="opt.icon" :name="opt.icon" />
        <template v-else>{{ opt.label }}</template>
        <span v-if="opt.badge" class="seg-badge"><AppIcon name="sparkle" />{{ opt.badge }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/SegmentedControl.css"></style>
