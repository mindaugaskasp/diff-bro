<script setup>
// One node of the XML tree, recursive: an element with children is collapsible,
// a leaf shows its text inline. Attributes read on the tag itself, the way the
// source does. Self-imported so the recursion resolves under
// vue/no-undef-components.
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import XmlTree from './XmlTree.vue'

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 }
})

const hasChildren = computed(() => props.node.children.length > 0)
const open = ref(props.depth < 2)
const pad = computed(() => ({ paddingLeft: `${props.depth * 14 + 8}px` }))
</script>

<template>
  <div class="xt">
    <div
      class="xt-row"
      :class="{ clickable: hasChildren }"
      :style="pad"
      @click="hasChildren && (open = !open)"
    >
      <span class="xt-tw">
        <AppIcon v-if="hasChildren" :name="open ? 'chevron-down' : 'chevron-right'" />
      </span>
      <span class="xt-punct">&lt;</span><span class="xt-tag">{{ node.name }}</span
      ><span v-for="[k, v] in node.attrs" :key="k" class="xt-attr">
        <span class="xt-key">{{ k }}</span
        ><span class="xt-punct">=</span><span class="xt-val">"{{ v }}"</span></span
      ><span class="xt-punct">&gt;</span>
      <span v-if="hasChildren && !open" class="xt-count">{{ node.children.length }}</span>
      <span v-else-if="node.text" class="xt-text">{{ node.text }}</span>
    </div>
    <template v-if="hasChildren && open">
      <XmlTree v-for="(child, i) in node.children" :key="i" :node="child" :depth="depth + 1" />
    </template>
  </div>
</template>

<style scoped src="./styles/XmlTree.css"></style>
