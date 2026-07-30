<script setup>
// Hover preview popover (fixed-positioned to escape the sidebar scroll). Text
// renders via interpolation only; hovering in keeps it open for its action.
import { computed } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { shaped } from '../utils/props'
import MermaidDiagram from './MermaidDiagram.vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  /** From useSnippetPreview. @type {import('vue').PropType<import('../types').SnippetPreview>} */
  preview: { type: Object, required: true, validator: shaped('name', 'tags', 'text', 'style') }
})
defineEmits(['edit', 'view'])
const store = useSnippetStore()
const isMermaid = computed(() => props.preview.lang === 'mermaid')
</script>

<template>
  <div class="preview interactive" :class="{ fit: !isMermaid }" :style="preview.style">
    <div class="pv-head">
      <span class="pv-titlewrap">
        <span class="pv-label">Title</span>
        <span class="pv-name">{{ preview.name }}</span>
      </span>
      <span v-if="preview.lang" class="pv-lang">{{ preview.lang }}</span>
    </div>
    <!-- A Mermaid snippet previews as its rendered diagram;
         clicking it opens the full-screen zoomable viewer. -->
    <button v-if="isMermaid" class="pv-diagram" title="View full screen" @click="$emit('view')">
      <MermaidDiagram :code="preview.text" :debounce="0" />
    </button>
    <button v-else class="pv-body" title="Open in editor" @click="$emit('edit')">
      {{ preview.text }}
    </button>
    <div class="pv-foot">
      <span class="pv-tags">
        <span v-for="t in preview.tags" :key="t" class="pv-tag">
          <span class="dot" :style="{ background: store.colorOf(t) }"></span>{{ t }}
        </span>
        <span v-if="!preview.tags.length" class="pv-untagged">Untagged</span>
      </span>
      <button v-if="isMermaid" class="pv-open" @click="$emit('view')">
        <AppIcon name="diagram" /> View full screen
      </button>
      <button v-else class="pv-open" @click="$emit('edit')">
        <AppIcon name="expand" /> Open in editor
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/SnippetPreviewCard.css"></style>
