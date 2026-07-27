<script setup>
import { ref } from 'vue'

// A slim "digital rain" lane under the toolbar, present only in the Matrix theme
// (App.vue mounts it with v-if) — the counterpart to NyanLane's flying cat. Each
// column falls on its own staggered CSS loop (GPU transform), and every time a
// column completes a fall it swaps in fresh glyphs, so the rain keeps shimmering
// instead of looping identically. Decorative → aria-hidden.
//
// Glyphs are digits + Latin letters + a few symbols (no katakana) so nothing
// tofus on a font that lacks the character — the same reason the app's UI icons
// are SVG, applied here to decorative text.
const GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>*+=/#'
const rnd = (n) => Math.floor(Math.random() * n)
const pick = () => Array.from({ length: 3 + rnd(4) }, () => GLYPHS[rnd(GLYPHS.length)])

const COLS = 56
const columns = ref(
  Array.from({ length: COLS }, (_, i) => ({
    left: (i / COLS) * 100,
    dur: 1.6 + Math.random() * 2.8,
    delay: -Math.random() * 4,
    glyphs: pick()
  }))
)

// Fresh glyphs each time a column finishes a fall — cheap, and keeps it alive.
function refresh(i, e) {
  if (e.animationName.startsWith('mr-fall')) columns.value[i].glyphs = pick()
}
</script>

<template>
  <div class="matrix-rain" aria-hidden="true">
    <div
      v-for="(c, i) in columns"
      :key="i"
      class="mr-col"
      :style="{ left: `${c.left}%`, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }"
      @animationiteration="refresh(i, $event)"
    >
      <span
        v-for="(g, j) in c.glyphs"
        :key="j"
        class="mr-ch"
        :class="{ head: j === c.glyphs.length - 1 }"
        >{{ g }}</span
      >
    </div>
  </div>
</template>

<style scoped src="./styles/MatrixRain.css"></style>
