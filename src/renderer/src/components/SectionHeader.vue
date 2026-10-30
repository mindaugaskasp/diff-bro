<script setup>
// The title band at the top of a sidebar panel.
defineProps({
  title: { type: String, required: true },
  count: { type: Number, default: null }
})
</script>

<template>
  <div class="head section-head band band-row">
    <slot name="title">
      <span class="section-title">{{ title }}</span>
      <span v-if="count !== null" class="count-chip">{{ count }}</span>
    </slot>
    <span v-if="$slots.actions" class="actions-slot"><slot name="actions" /></span>
  </div>
</template>

<style scoped src="./styles/SectionHeader.css"></style>
