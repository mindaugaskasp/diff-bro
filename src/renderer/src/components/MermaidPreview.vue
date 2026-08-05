<script setup>
// The snippet editor's live Mermaid preview + an "expand to full viewer" button.
import { ref } from 'vue'
import { DIAGRAM_THEME_OPTIONS } from '../utils/mermaid'
import MermaidDiagram from './MermaidDiagram.vue'
import SegmentedControl from './SegmentedControl.vue'
import AppIcon from './AppIcon.vue'

defineProps({ code: { type: String, default: '' } })
const emit = defineEmits(['expand'])

// Scoped to this editor session, never persisted: picking a ground to read one
// diagram on is not a preference about every future diagram.
const diagramTheme = ref('auto')
</script>

<template>
  <div class="mmd-preview">
    <div class="mmd-preview-head">
      <span>Diagram preview</span>
      <SegmentedControl
        label="Theme"
        :value="diagramTheme"
        :options="DIAGRAM_THEME_OPTIONS"
        @update:value="diagramTheme = $event"
      />
      <button
        type="button"
        class="btn btn-sm"
        :disabled="!code.trim()"
        data-tip="Open the full, resizable diagram viewer"
        @click="emit('expand', diagramTheme)"
      >
        <AppIcon name="expand" /> Expand
      </button>
    </div>
    <div class="mmd-preview-body"><MermaidDiagram :code="code" :theme="diagramTheme" /></div>
  </div>
</template>

<style scoped src="./styles/MermaidPreview.css"></style>
