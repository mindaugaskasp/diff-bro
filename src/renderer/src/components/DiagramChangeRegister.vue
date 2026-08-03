<script setup>
defineProps({
  /** @type {import('vue').PropType<object[]>} */
  nodes: { type: Array, required: true },
  /** @type {import('vue').PropType<object[]>} */
  edges: { type: Array, required: true }
})

const MARK = { added: '+', removed: '−', changed: '±', renamed: '±' }
const CLASS = { added: 'add', removed: 'del', changed: 'chg', renamed: 'chg' }

const nodeName = (r) => r.label || r.id
const nodeWhy = (r) => {
  if (r.status === 'renamed') return `renamed from ${r.wasId}`
  if (r.status === 'changed' && r.was != null) return `was “${r.was}”`
  return r.status === 'added' ? 'new' : 'removed'
}
const edgeName = (r) => `${r.start} → ${r.end}`
const edgeWhy = (r) => (r.status === 'changed' && r.was != null ? `was “${r.was}”` : '')
</script>

<template>
  <aside class="dg-register">
    <template v-if="nodes.length">
      <div class="reghead">Changes</div>
      <button
        v-for="r in nodes"
        :key="`n${r.id}`"
        type="button"
        class="regrow"
        :class="CLASS[r.status]"
      >
        <span class="rmark">{{ MARK[r.status] }}</span>
        <span
          ><b>{{ nodeName(r) }}</b
          ><em>{{ nodeWhy(r) }}</em></span
        >
      </button>
    </template>
    <template v-if="edges.length">
      <div class="reghead">Edges</div>
      <button
        v-for="r in edges"
        :key="`e${r.start}${r.end}${r.status}`"
        type="button"
        class="regrow"
        :class="CLASS[r.status]"
      >
        <span class="rmark">{{ MARK[r.status] }}</span>
        <span
          ><b>{{ edgeName(r) }}</b
          ><em v-if="edgeWhy(r)">{{ edgeWhy(r) }}</em></span
        >
      </button>
    </template>
  </aside>
</template>

<style scoped src="./styles/DiagramChangeRegister.css"></style>
