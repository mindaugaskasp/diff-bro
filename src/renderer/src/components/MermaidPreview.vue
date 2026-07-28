<script setup>
// The snippet editor's live Mermaid preview + an "expand to full viewer" button.
import MermaidDiagram from './MermaidDiagram.vue'
import AppIcon from './AppIcon.vue'

defineProps({ code: { type: String, default: '' } })
defineEmits(['expand'])
</script>

<template>
  <div class="mmd-preview">
    <div class="mmd-preview-head">
      <span>Diagram preview</span>
      <button
        type="button"
        class="btn btn-sm btn-ghost"
        :disabled="!code.trim()"
        title="Open the full, resizable diagram viewer"
        @click="$emit('expand')"
      >
        <AppIcon name="expand" /> Expand
      </button>
    </div>
    <div class="mmd-preview-body"><MermaidDiagram :code="code" /></div>
  </div>
</template>

<style scoped src="./styles/MermaidPreview.css"></style>
