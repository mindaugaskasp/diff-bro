<script setup>
// A table block from either markup (jiraRender / markdownRender emit the same
// shape). Its own component so JiraRendered stays inside its template cap, and
// because a table is the one block with a shape of its own rather than a run of
// inlines. Cells interpolate through JiraInline — never v-html (rule 8).
import { shaped } from '../utils/props'
import JiraInline from './JiraInline.vue'

const props = defineProps({
  /** @type {import('../types').JiraBlock} */
  block: { type: Object, required: true, validator: shaped('type', 'rows') }
})

// Markdown carries per-column alignment in its separator row; Jira has none, so
// every column reads as start-aligned there.
const align = (i) => {
  const at = props.block.align?.[i]
  return at ? { textAlign: at } : null
}
</script>

<template>
  <div class="ji-table-wrap">
    <table class="ji-table">
      <thead v-if="block.head?.length">
        <tr>
          <th v-for="(cell, i) in block.head" :key="i" :style="align(i)">
            <JiraInline :nodes="cell" />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, r) in block.rows" :key="r">
          <td v-for="(cell, i) in row" :key="i" :style="align(i)">
            <JiraInline :nodes="cell" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped src="./styles/JiraTable.css"></style>
