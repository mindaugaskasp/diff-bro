<script setup>
// The `color` prop feeds --tc, not `color`: ui.css inks it against the theme's
// ground, which a raw dark-ground palette value cannot survive on a light one.
defineProps({ color: { type: String, default: 'var(--text-dim)' } })
</script>

<template>
  <svg
    class="tglyph"
    viewBox="0 0 24 24"
    :style="{ '--tc': color }"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" />
    <circle cx="7.3" cy="7.3" r="1.25" fill="currentColor" stroke="none" />
  </svg>
</template>

<style scoped src="./styles/TagGlyph.css"></style>
