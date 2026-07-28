<script setup>
import { ref } from 'vue'
import { NYAN_CATS } from '../assets/nyanCat'

// A rainbow lane for the Nyan theme; the cat loops across it. Decorative →
// aria-hidden. Cat art: CC0 freesvg.org, inlined as data URLs.

// Rotate the flavor each pass (off-screen, so the swap is invisible), never
// repeating back-to-back.
const idx = ref(Math.floor(Math.random() * NYAN_CATS.length))
function nextCat(e) {
  // scoped CSS hashes the keyframe name (nyan-fly-<hash>), so match the prefix.
  if (!e.animationName.startsWith('nyan-fly')) return
  if (NYAN_CATS.length < 2) return
  let n = idx.value
  while (n === idx.value) n = Math.floor(Math.random() * NYAN_CATS.length)
  idx.value = n
}
</script>

<template>
  <div class="nyan-lane" aria-hidden="true">
    <div class="flyer" @animationiteration="nextCat">
      <div class="trail"></div>
      <img class="nyan-body" :src="NYAN_CATS[idx]" alt="" />
    </div>
  </div>
</template>

<style scoped src="./styles/NyanLane.css"></style>
