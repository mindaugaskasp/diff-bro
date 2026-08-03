<script setup>
import { shaped } from '../utils/props'

defineProps({
  /** @type {import('vue').PropType<object[]>} */
  rows: { type: Array, required: true, validator: (v) => v.every(shaped('status')) }
})

const label = (r) => (r.start ? `${r.start} → ${r.end}` : (r.label ?? r.id))
const detail = (r) => {
  if (r.status === 'renamed') return `was ${r.wasId}`
  if (r.status === 'changed' && r.was != null) return `was “${r.was}”`
  return ''
}
</script>

<template>
  <ul class="dg-register">
    <li v-for="(r, i) in rows" :key="i" :class="r.status">
      <span class="dg-mark">{{
        r.status === 'added' ? '+' : r.status === 'removed' ? '−' : '±'
      }}</span>
      <span class="dg-what">{{ label(r) }}</span>
      <span v-if="detail(r)" class="dg-was">{{ detail(r) }}</span>
    </li>
  </ul>
</template>

<style scoped src="./styles/DiagramChangeRegister.css"></style>
