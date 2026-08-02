<script setup>
// The snippet editor's live Mermaid preview + an "expand to full viewer" button.
import { useSettingsStore } from '../stores/settingsStore'
import { DIAGRAM_THEME_OPTIONS } from '../utils/mermaid'
import MermaidDiagram from './MermaidDiagram.vue'
import SegmentedControl from './SegmentedControl.vue'
import AppIcon from './AppIcon.vue'

defineProps({ code: { type: String, default: '' } })
defineEmits(['expand'])

const settings = useSettingsStore()
</script>

<template>
  <div class="mmd-preview">
    <div class="mmd-preview-head">
      <span>Diagram preview</span>
      <SegmentedControl
        label="Theme"
        :value="settings.diagramTheme"
        :options="DIAGRAM_THEME_OPTIONS"
        @update:value="settings.setDiagramTheme($event)"
      />
      <button
        type="button"
        class="btn btn-sm"
        :disabled="!code.trim()"
        data-tip="Open the full, resizable diagram viewer"
        @click="$emit('expand')"
      >
        <AppIcon name="expand" /> Expand
      </button>
    </div>
    <div class="mmd-preview-body"><MermaidDiagram :code="code" /></div>
  </div>
</template>

<style scoped src="./styles/MermaidPreview.css"></style>
