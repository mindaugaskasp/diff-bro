<script setup>
import { ref } from 'vue'

// Decorative "digital rain" for the Matrix theme (aria-hidden). Glyphs avoid
// katakana so nothing tofus on a font that lacks them.
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
