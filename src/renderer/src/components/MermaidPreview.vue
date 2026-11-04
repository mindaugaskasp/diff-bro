<script setup>
// The snippet editor's live Mermaid preview + an "expand to full viewer" button.
import { ref } from 'vue'
import { usePreviewResize } from '../composables/usePreviewResize'
import { useZoomPan } from '../composables/useZoomPan'
import { DIAGRAM_THEME_OPTIONS } from '../utils/mermaid'
import MermaidDiagram from './MermaidDiagram.vue'
import SegmentedControl from './SegmentedControl.vue'
import AppIcon from './AppIcon.vue'

defineProps({ code: { type: String, default: '' } })
const emit = defineEmits(['expand'])

// Scoped to this editor session, never persisted: picking a ground to read one
// diagram on is not a preference about every future diagram.
const diagramTheme = ref('auto')
// Same rule as the full viewer: whatever CLIPS the diagram wears the paper.
const paper = ref('')
const root = ref(null)
const size = usePreviewResize(() => root.value?.parentElement?.clientHeight ?? Infinity)
const { scale, tx, ty, pct, zoom, fit, onWheel, onDown, onMove, onUp } = useZoomPan()
</script>

<template>
  <div ref="root" class="mmd-preview" :class="{ resizing: size.resizing.value }">
    <div
      class="mmd-grip"
      role="separator"
      aria-orientation="horizontal"
      :aria-label="$t('mermaidPreview.dragToResize')"
      :data-tip="$t('mermaidPreview.dragToResizeTip')"
      @pointerdown="size.start"
      @dblclick="size.reset"
    ></div>
    <div class="mmd-card">
      <div class="mmd-preview-head">
        <span>{{ $t('mermaidPreview.diagramPreview') }}</span>
        <SegmentedControl
          :label="$t('mermaidPreview.theme')"
          :value="diagramTheme"
          :options="DIAGRAM_THEME_OPTIONS"
          @update:value="diagramTheme = $event"
        />
        <div class="mmd-tools">
          <button
            type="button"
            class="btn btn-sm btn-icon"
            :data-tip="$t('mermaidViewerDialog.zoomOut')"
            :aria-label="$t('mermaidViewerDialog.zoomOut')"
            @click="zoom(1 / 1.2)"
          >
            <AppIcon name="minus" />
          </button>
          <button
            type="button"
            class="btn btn-sm mmd-pct"
            :data-tip="$t('mermaidPreview.resetZoom')"
            @click="fit"
          >
            {{ pct }}%
          </button>
          <button
            type="button"
            class="btn btn-sm btn-icon"
            :data-tip="$t('mermaidViewerDialog.zoomIn')"
            :aria-label="$t('mermaidViewerDialog.zoomIn')"
            @click="zoom(1.2)"
          >
            <AppIcon name="plus" />
          </button>
          <button
            type="button"
            class="btn btn-sm"
            :disabled="!code.trim()"
            :data-tip="$t('mermaidPreview.openTheFullResizableDiagram')"
            @click="emit('expand', diagramTheme)"
          >
            <AppIcon name="expand" /> {{ $t('mermaidPreview.expand') }}
          </button>
        </div>
      </div>
      <div
        class="mmd-preview-body"
        :data-paper="paper || null"
        :style="{ height: `${size.height.value}px` }"
        @wheel="onWheel"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointerleave="onUp"
      >
        <div class="transform" :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }">
          <MermaidDiagram :code="code" :theme="diagramTheme" @paper="paper = $event" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles/MermaidPreview.css"></style>
