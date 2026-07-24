<script setup>
import { ref } from 'vue'
import { NYAN_CATS } from '../assets/nyanCat'

// A slim rainbow lane under the toolbar, present only in the Nyan theme (App.vue
// mounts it with v-if). The cat loops across it continuously, trailing a rainbow
// (CSS) that dissipates like smoke behind it — pure ambient whimsy, kept in the
// chrome so it never touches the diff. Decorative → aria-hidden.
// Cat art: CC0 freesvg.org Nyan cat + recolored flavors, inlined as data URLs.

// Rotate the flavor on each completed pass — the nyan-fly loop restarts while the
// cat is off-screen, so the swap is invisible and a different cat runs by each
// time. Random, never repeating the current one back-to-back.
const idx = ref(Math.floor(Math.random() * NYAN_CATS.length))
function nextCat(e) {
  // <style scoped> renames @keyframes with a hash suffix (nyan-fly-<hash>), so
  // match the prefix — and this still excludes the fast nyan-bob iterations.
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
