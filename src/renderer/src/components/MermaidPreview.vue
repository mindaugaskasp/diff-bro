<script setup>
// The snippet editor's live Mermaid preview + an "expand to full viewer" button.
import { ref } from 'vue'
import { usePreviewResize } from '../composables/usePreviewResize'
import { DIAGRAM_THEME_OPTIONS } from '../utils/mermaid'
import MermaidDiagram from './MermaidDiagram.vue'
import SegmentedControl from './SegmentedControl.vue'
import AppIcon from './AppIcon.vue'

defineProps({ code: { type: String, default: '' } })
const emit = defineEmits(['expand'])

// Scoped to this editor session, never persisted: picking a ground to read one
// diagram on is not a preference about every future diagram.
const diagramTheme = ref('auto')
// The body is padded, so a pinned diagram left the sheet inset inside a gutter
// of the app's own ground. Same rule as the full viewer: whatever CLIPS the
// diagram wears the paper.
const paper = ref('')
const root = ref(null)
const size = usePreviewResize(() => root.value?.parentElement?.clientHeight ?? Infinity)
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
    <div class="mmd-preview-head">
      <span>{{ $t('mermaidPreview.diagramPreview') }}</span>
      <SegmentedControl
        :label="$t('mermaidPreview.theme')"
        :value="diagramTheme"
        :options="DIAGRAM_THEME_OPTIONS"
        @update:value="diagramTheme = $event"
      />
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
    <div
      class="mmd-preview-body"
      :data-paper="paper || null"
      :style="{ height: `${size.height.value}px` }"
    >
      <MermaidDiagram :code="code" :theme="diagramTheme" @paper="paper = $event" />
    </div>
  </div>
</template>

<style scoped src="./styles/MermaidPreview.css"></style>
