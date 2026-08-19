<script setup>
// A Jira block tree (utils/jiraRender) rendered as real elements — all text
// interpolated, never HTML injection (rule 7).
import { computed } from 'vue'
import { parseJira } from '../utils/jiraRender'
import { arrayOfShape } from '../utils/props'
import JiraInline from './JiraInline.vue'
import JiraTable from './JiraTable.vue'

const props = defineProps({
  content: { type: String, default: null },
  /** @type {import('../types').JiraBlock[]} */
  blocks: { type: Array, default: null, validator: (v) => v === null || arrayOfShape('type')(v) },
  // Opt-in: a task box is inert in a preview and tickable inside RenderedEditor,
  // where a change writes `- [x]` back to the source.
  tickable: { type: Boolean, default: false }
})

const items = computed(() => props.blocks ?? parseJira(props.content ?? ''))
const isEmpty = computed(() => props.content !== null && items.value.length === 0)
// Nested list items step in by their marker depth.
const indent = (depth) => (depth > 1 ? { marginInlineStart: `${(depth - 1) * 16}px` } : null)
</script>

<template>
  <div class="jira-rendered">
    <p v-if="isEmpty" class="ji-empty">{{ $t('jiraRendered.nothingToPreviewYetSwitch') }}</p>
    <template v-for="(b, i) in items" :key="i">
      <component :is="`h${b.level}`" v-if="b.type === 'heading'" class="ji-h">
        <JiraInline :nodes="b.inlines" />
      </component>
      <ol v-else-if="b.type === 'list' && b.ordered" class="ji-list">
        <li
          v-for="(it, k) in b.items"
          :key="k"
          :style="indent(it.depth)"
          :data-depth="it.depth ?? 1"
        >
          <JiraInline :nodes="it.inlines" />
        </li>
      </ol>
      <ul v-else-if="b.type === 'list'" class="ji-list" :class="{ 'ji-tasks': b.items[0]?.task }">
        <li
          v-for="(it, k) in b.items"
          :key="k"
          :style="indent(it.depth)"
          :data-depth="it.depth ?? 1"
          :class="{ 'ji-task': it.task }"
        >
          <input
            v-if="it.task"
            type="checkbox"
            :checked="it.checked"
            :disabled="!tickable"
            :tabindex="tickable ? 0 : -1"
          />
          <JiraInline :nodes="it.inlines" />
        </li>
      </ul>
      <JiraTable v-else-if="b.type === 'table'" :block="b" />
      <blockquote v-else-if="b.type === 'quote'" class="ji-quote">
        <JiraRendered :blocks="b.children" :tickable="tickable" />
      </blockquote>
      <pre v-else-if="b.type === 'code'" class="ji-code">{{ b.code }}</pre>
      <p v-else class="ji-p">
        <template v-for="(ln, j) in b.lines" :key="j"
          ><br v-if="j" /><JiraInline :nodes="ln"
        /></template>
      </p>
    </template>
  </div>
</template>

<style scoped src="./styles/JiraRendered.css"></style>
