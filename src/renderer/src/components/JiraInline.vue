<script setup>
// Renders a run of inline nodes from jiraRender as real elements — recursing
// into itself for nested emphasis. Every bit of user text goes through Vue text
// interpolation ({{ }}); there is no HTML injection anywhere, which is what keeps
// the rendered preview on the right side of the no-`v-html`/`innerHTML` rule.
import { arrayOfShape } from '../utils/props'

defineProps({
  /** @type {import('../types').JiraInlineNode[]} */
  nodes: { type: Array, required: true, validator: arrayOfShape('type') }
})
</script>

<template>
  <template v-for="(n, i) in nodes" :key="i"
    ><template v-if="n.type === 'text'">{{ n.value }}</template
    ><strong v-else-if="n.type === 'strong'"><JiraInline :nodes="n.inlines" /></strong
    ><em v-else-if="n.type === 'em'"><JiraInline :nodes="n.inlines" /></em
    ><u v-else-if="n.type === 'ins'"><JiraInline :nodes="n.inlines" /></u
    ><s v-else-if="n.type === 'del'"><JiraInline :nodes="n.inlines" /></s
    ><code v-else-if="n.type === 'code'" class="ji-mono">{{ n.value }}</code
    ><span v-else-if="n.type === 'link'" class="ji-link" :title="n.href">{{ n.label }}</span
  ></template>
</template>

<style scoped src="./styles/JiraInline.css"></style>
