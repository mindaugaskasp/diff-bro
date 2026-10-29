<script setup>
// Snippets or diffs as sections by tag (#121): Favourites, the tag tree, then
// Untagged. Rows come from the list that owns them, through the `row` slot.
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildTagTree } from '../utils/tagTree'
import { useTagSections } from '../composables/useTagSections'
import TagSection from './TagSection.vue'

const props = defineProps({
  items: { type: Array, required: true },
  list: { type: String, required: true, validator: (v) => ['snippets', 'diffs'].includes(v) },
  searching: { type: Boolean, default: false },
  /** The # scope: only its branch shows. */
  scope: { type: String, default: '' },
  colorOf: { type: Function, default: () => '' },
  /** Which of an item's tags place it in the tree. */
  tagsOf: { type: Function, default: (item) => item.tags ?? [] }
})
defineEmits(['manage'])

const { t } = useI18n()
const sections = useTagSections(props.list, toRef(props, 'searching'))
const tree = computed(() =>
  buildTagTree(props.items, { within: props.scope, tagsOf: props.tagsOf })
)
const special = (path, labelKey, items) => ({
  path,
  label: t(labelKey),
  items,
  count: items.length,
  children: []
})
const favorites = computed(() => special('★', 'tagTree.favorites', tree.value.favorites))
const untagged = computed(() => special('∅', 'tagTree.untagged', tree.value.untagged))
// A branch takes one colour: its top tag's, else the first tag under it with one.
function branchColor(node) {
  const own = props.colorOf(node.path)
  if (own) return own
  for (const child of node.children) {
    const found = branchColor(child)
    if (found) return found
  }
  return ''
}
</script>

<template>
  <ul class="tag-tree">
    <TagSection v-if="favorites.count" :node="favorites" :sections="sections" star>
      <template #row="p"><slot name="row" v-bind="p" /></template>
    </TagSection>
    <TagSection
      v-for="node in tree.sections"
      :key="node.path"
      :node="node"
      :sections="sections"
      :inherited="branchColor(node)"
      @manage="$emit('manage', $event)"
    >
      <template #row="p"><slot name="row" v-bind="p" /></template>
    </TagSection>
    <TagSection v-if="untagged.count" :node="untagged" :sections="sections">
      <template #row="p"><slot name="row" v-bind="p" /></template>
    </TagSection>
  </ul>
</template>

<style scoped src="./styles/TagTree.css"></style>
