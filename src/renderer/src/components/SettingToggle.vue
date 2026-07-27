<script setup>
// A labeled checkbox row for the Settings panel. Self-contained styling so it
// doesn't lean on the parent's scoped `.row` rules, and one place to keep the
// toggle rows consistent as more of them are added.
defineProps({ checked: { type: Boolean, default: false } })
defineEmits(['change'])
</script>

<template>
  <label class="setting-toggle">
    <input type="checkbox" :checked="checked" @change="$emit('change', $event.target.checked)" />
    <span><slot /></span>
  </label>
</template>

<style scoped src="./styles/SettingToggle.css"></style>
