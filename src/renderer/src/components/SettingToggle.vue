<script setup>
// A labeled checkbox row for the Settings panel; self-contained styling.
defineProps({
  checked: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
})
defineEmits(['change'])
</script>

<template>
  <label class="setting-toggle" :class="{ disabled }">
    <input
      type="checkbox"
      :checked="checked"
      :disabled="disabled"
      @change="$emit('change', $event.target.checked)"
    />
    <span><slot /></span>
  </label>
</template>

<style scoped src="./styles/SettingToggle.css"></style>
