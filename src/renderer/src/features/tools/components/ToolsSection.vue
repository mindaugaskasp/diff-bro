<script setup>
// The Tools panel: every registered tool, narrowed by the sidebar search.
import { computed } from 'vue'
import ToolTiles from './ToolTiles.vue'
import { useToolsStore } from '../toolsStore'
import { t } from '../../../i18n'
import { namedTools } from '../../../utils/tools'

const props = defineProps({
  search: { type: String, default: '' },
  /** @type {import('vue').PropType<string[]>} */
  tags: { type: Array, default: () => [] }
})

const store = useToolsStore()

const q = computed(() => props.search.trim().toLowerCase())
// A tool carries no tags, so any tag filter excludes every one.
const matches = computed(() => {
  if (props.tags.length) return []
  const rows = namedTools(store.rows, t)
  if (!q.value) return rows
  return rows.filter(
    (row) => row.name.toLowerCase().includes(q.value) || row.kind.toLowerCase().includes(q.value)
  )
})
</script>

<template>
  <section class="sidebar-section">
    <ToolTiles :tools="matches" />
  </section>
</template>
