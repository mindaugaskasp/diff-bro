<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** @type {import('vue').PropType<object[]>} */
  nodes: { type: Array, required: true },
  /** @type {import('vue').PropType<object[]>} */
  edges: { type: Array, required: true }
})

const MARK = { added: '+', removed: '−', changed: '±', renamed: '±' }
const CLASS = { added: 'add', removed: 'del', changed: 'chg', renamed: 'chg' }

// Node labels by id, so an edge reads "orders → ledger" rather than the raw
// identifiers the source happens to use.
const labels = computed(() => new Map(props.nodes.map((n) => [n.id, n.label || n.id])))
const named = (id) => labels.value.get(id) ?? id

// Only when it says something the mark does not: "+ authz" already means new.
const nodeWhy = (r) => {
  if (r.status === 'renamed') return `was ${r.wasId}`
  if (r.status === 'changed' && r.was != null) return `was “${r.was}”`
  return ''
}
</script>

<template>
  <aside class="dg-register">
    <template v-if="nodes.length">
      <h3 class="reghead">
        {{ $t('diagramChangeRegister.nodes') }}<span class="count">{{ nodes.length }}</span>
      </h3>
      <ul class="reglist">
        <li v-for="r in nodes" :key="`n${r.id}`" class="regrow" :class="CLASS[r.status]">
          <span class="rmark" aria-hidden="true">{{ MARK[r.status] }}</span>
          <span class="rname">{{ r.label || r.id }}</span>
          <span v-if="nodeWhy(r)" class="rwas">{{ nodeWhy(r) }}</span>
        </li>
      </ul>
    </template>
    <template v-if="edges.length">
      <h3 class="reghead">
        {{ $t('diagramChangeRegister.edges') }}<span class="count">{{ edges.length }}</span>
      </h3>
      <ul class="reglist">
        <li
          v-for="r in edges"
          :key="`e${r.start}${r.end}${r.status}`"
          class="regrow"
          :class="CLASS[r.status]"
        >
          <span class="rmark" aria-hidden="true">{{ MARK[r.status] }}</span>
          <span class="rname"
            >{{ named(r.start) }} <span class="arrow">→</span> {{ named(r.end) }}</span
          >
        </li>
      </ul>
    </template>
  </aside>
</template>

<style scoped src="./styles/DiagramChangeRegister.css"></style>
