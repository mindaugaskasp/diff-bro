<script setup>
import { shaped } from '../utils/props'

defineProps({
  /** @type {import('vue').PropType<object[]>} */
  rows: { type: Array, required: true, validator: (v) => v.every(shaped('status')) }
})

// Stable across re-renders: an index key makes Vue reuse the wrong row when a
// status changes and the list reorders.
const keyOf = (r) => `${r.status}:${r.start ? `${r.start}->${r.end}` : r.id}`
const label = (r) => (r.start ? `${r.start} → ${r.end}` : (r.label ?? r.id))
const detail = (r) => {
  if (r.status === 'renamed') return `was ${r.wasId}`
  if (r.status === 'changed' && r.was != null) return `was “${r.was}”`
  return ''
}
</script>

<template>
  <ul class="dg-register">
    <li v-for="r in rows" :key="keyOf(r)" :class="r.status">
      <span class="dg-mark">{{
        r.status === 'added' ? '+' : r.status === 'removed' ? '−' : '±'
      }}</span>
      <span class="dg-what">{{ label(r) }}</span>
      <span v-if="detail(r)" class="dg-was">{{ detail(r) }}</span>
    </li>
  </ul>
</template>

<style scoped src="./styles/DiagramChangeRegister.css"></style>
