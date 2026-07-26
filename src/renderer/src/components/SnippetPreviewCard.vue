<script setup>
// Hover preview popover. Fixed-positioned so it escapes the sidebar's scroll
// container; the decrypted text renders through interpolation only.
import { useSnippetStore } from '../stores/snippetStore'
import { shaped } from '../utils/props'
import MermaidDiagram from './MermaidDiagram.vue'

defineProps({
  /** From useSnippetPreview. @type {import('vue').PropType<import('../types').SnippetPreview>} */
  preview: { type: Object, required: true, validator: shaped('name', 'tags', 'text', 'style') }
})
const store = useSnippetStore()
</script>

<template>
  <div class="preview" :style="preview.style">
    <div class="pv-head">
      <span class="pv-titlewrap">
        <span class="pv-label">Title</span>
        <span class="pv-name">{{ preview.name }}</span>
      </span>
      <span v-if="preview.lang" class="pv-lang">{{ preview.lang }}</span>
    </div>
    <!-- A Mermaid snippet previews as its rendered diagram, not its source. -->
    <div v-if="preview.lang === 'mermaid'" class="pv-diagram">
      <MermaidDiagram :code="preview.text" :debounce="0" />
    </div>
    <pre v-else class="pv-body">{{ preview.text }}</pre>
    <div class="pv-foot">
      <span class="pv-tags">
        <span v-for="t in preview.tags" :key="t" class="pv-tag">
          <span class="dot" :style="{ background: store.colorOf(t) }"></span>{{ t }}
        </span>
        <span v-if="!preview.tags.length" class="pv-untagged">Default</span>
      </span>
    </div>
  </div>
</template>

<style scoped src="./styles/SnippetPreviewCard.css"></style>
