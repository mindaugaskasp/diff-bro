<script setup>
// One SVG icon from the shared set (see ../icons.js). Sizes to 1em and inherits
// currentColor, so it drops in wherever a text glyph used to sit. Explicit
// element tags (not <component :is>) keep every child in the SVG namespace.
import { ICONS } from '../icons'

defineProps({
  name: { type: String, required: true },
  // Decorative labels supply a title via the button; a standalone icon that
  // carries meaning on its own can pass one here.
  title: { type: String, default: '' }
})
</script>

<template>
  <svg
    class="app-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :aria-hidden="title ? undefined : 'true'"
    :aria-label="title || undefined"
    :role="title ? 'img' : undefined"
  >
    <template v-for="(el, i) in ICONS[name]" :key="i">
      <path
        v-if="el.t === 'path'"
        :d="el.d"
        :fill="el.fill ? 'currentColor' : undefined"
        :stroke="el.fill ? 'none' : undefined"
      />
      <rect
        v-else-if="el.t === 'rect'"
        :x="el.x"
        :y="el.y"
        :width="el.width"
        :height="el.height"
        :rx="el.rx"
      />
      <circle
        v-else-if="el.t === 'circle'"
        :cx="el.cx"
        :cy="el.cy"
        :r="el.r"
        :fill="el.fill ? 'currentColor' : undefined"
        :stroke="el.fill ? 'none' : undefined"
      />
      <line v-else-if="el.t === 'line'" :x1="el.x1" :y1="el.y1" :x2="el.x2" :y2="el.y2" />
    </template>
  </svg>
</template>

<style scoped src="./styles/AppIcon.css"></style>
