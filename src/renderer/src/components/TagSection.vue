<script setup>
// One tag section of the tree, and everything nested under it (#121).
import { computed } from 'vue'
import { shaped } from '../utils/props'
import AppIcon from './AppIcon.vue'

defineOptions({ name: 'TagSection' })
const props = defineProps({
  /** @type {import('vue').PropType<import('../types').TagNode>} */
  node: { type: Object, required: true, validator: shaped('path', 'label', 'items', 'count') },
  depth: { type: Number, default: 0 },
  /** useTagSections() for this list. */
  sections: { type: Object, required: true, validator: shaped('isOpen', 'toggle') },
  /** The branch's colour, set once at its top. */
  inherited: { type: String, default: '' },
  star: { type: Boolean, default: false }
})
defineEmits(['manage'])

const open = computed(() => props.sections.isOpen(props.node.path))
const color = computed(() => props.inherited)
const children = computed(() => props.node.children ?? [])
</script>

<template>
  <li class="tag-section">
    <button
      type="button"
      class="ts-head band"
      :style="{ '--depth': depth }"
      :aria-expanded="open"
      :data-path="node.path"
      @click="sections.toggle(node.path)"
      @contextmenu.prevent="star || $emit('manage', node.path)"
    >
      <AppIcon :name="open ? 'chevron-down' : 'chevron-right'" class="ts-chev" />
      <AppIcon v-if="star" name="star-filled" class="ts-star" />
      <span v-else-if="color" class="ts-dot" :style="{ background: color }" />
      <span class="ts-label">{{ node.label }}</span>
      <span class="ts-count">{{ node.count }}</span>
    </button>
    <template v-if="open">
      <ul v-if="node.items.length" class="ts-rows" :style="{ '--depth': depth + 1 }">
        <template v-for="item in node.items" :key="item.id">
          <slot name="row" :item="item" :section="node.path" />
        </template>
      </ul>
      <ul v-if="children.length" class="ts-children">
        <TagSection
          v-for="child in children"
          :key="child.path"
          :node="child"
          :depth="depth + 1"
          :sections="sections"
          :inherited="color"
          @manage="$emit('manage', $event)"
        >
          <template #row="slotProps"><slot name="row" v-bind="slotProps" /></template>
        </TagSection>
      </ul>
    </template>
  </li>
</template>

<style scoped src="./styles/TagSection.css"></style>
