<script setup>
// The rendered ("what it looks like") view of a Jira/Confluence snippet. Parses
// the markup into a block tree (utils/jiraRender) and renders it as real
// elements — recursing into itself for quote children, and into JiraInline for
// inline runs. No HTML injection: all text is interpolated. Given `content` it
// parses; given `blocks` (the recursive case) it renders them directly.
import { computed } from 'vue'
import { parseJira } from '../utils/jiraRender'
import { arrayOfShape } from '../utils/props'
import JiraInline from './JiraInline.vue'

const props = defineProps({
  content: { type: String, default: null },
  /** @type {import('../types').JiraBlock[]} */
  blocks: { type: Array, default: null, validator: (v) => v === null || arrayOfShape('type')(v) }
})

const items = computed(() => props.blocks ?? parseJira(props.content ?? ''))
const isEmpty = computed(() => props.content !== null && items.value.length === 0)
// Nested list items step in by their marker depth.
const indent = (depth) => (depth > 1 ? { marginInlineStart: `${(depth - 1) * 16}px` } : null)
</script>

<template>
  <div class="jira-rendered">
    <p v-if="isEmpty" class="ji-empty">Nothing to preview yet — switch to Plain to write.</p>
    <template v-for="(b, i) in items" :key="i">
      <component :is="`h${b.level}`" v-if="b.type === 'heading'" class="ji-h">
        <JiraInline :nodes="b.inlines" />
      </component>
      <ol v-else-if="b.type === 'list' && b.ordered" class="ji-list">
        <li v-for="(it, k) in b.items" :key="k" :style="indent(it.depth)">
          <JiraInline :nodes="it.inlines" />
        </li>
      </ol>
      <ul v-else-if="b.type === 'list'" class="ji-list">
        <li v-for="(it, k) in b.items" :key="k" :style="indent(it.depth)">
          <JiraInline :nodes="it.inlines" />
        </li>
      </ul>
      <blockquote v-else-if="b.type === 'quote'" class="ji-quote">
        <JiraRendered :blocks="b.children" />
      </blockquote>
      <pre v-else-if="b.type === 'code'" class="ji-code">{{ b.code }}</pre>
      <p v-else class="ji-p">
        <template v-for="(ln, j) in b.lines" :key="j"><br v-if="j" /><JiraInline :nodes="ln" /></template>
      </p>
    </template>
  </div>
</template>

<style scoped src="./styles/JiraRendered.css"></style>
