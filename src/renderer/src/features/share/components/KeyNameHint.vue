<script setup>
defineProps({
  count: { type: String, required: true },
  message: { type: String, default: '' }
})
</script>

<template>
  <p class="key-name-hint">
    <span v-if="message" class="problem" role="alert">{{ message }}</span>
    <span class="count">{{ count }}</span>
  </p>
</template>

<style scoped src="./styles/KeyNameHint.css"></style>
