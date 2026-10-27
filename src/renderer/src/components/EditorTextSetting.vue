<script setup>
import { computed, onMounted, ref } from 'vue'
import { MOD } from '../keys'
import { useEditorFontStore } from '../stores/editorFontStore'
import { useUiStore } from '../stores/uiStore'
import { fontStack, installedFonts } from '../utils/editorFonts'
import { zoomLabel } from '../utils/diffZoom'
import AppIcon from './AppIcon.vue'

const fonts = useEditorFontStore()
const ui = useUiStore()
const installed = ref([])
// Code, not copy: the look-alike characters are what a preview is for.
const PREVIEW = [
  'const diff = compare(left, right) // 0O 1lI {}[]',
  'curl -fsS https://example.com/health'
]

// A canvas measures a fixed sample in each face; a missing face measures as its fallback.
function measureWith() {
  const ctx = document.createElement('canvas').getContext('2d')
  return (css) => {
    ctx.font = css
    return ctx.measureText('mmmmmmmmmmlli 0O1{}').width
  }
}
onMounted(() => (installed.value = installedFonts(measureWith())))

const previewFace = computed(() => fontStack(fonts.family) || 'var(--font-mono)')
</script>

<template>
  <h4>{{ $t('editorText.title') }}</h4>
  <p class="hint">{{ $t('editorText.hint') }}</p>
  <label class="row">
    <span>{{ $t('editorText.font') }}</span>
    <select
      :value="fonts.family"
      :aria-label="$t('editorText.fontLabel')"
      @change="fonts.setFamily($event.target.value)"
    >
      <option value="">{{ $t('editorText.systemDefault') }}</option>
      <option v-for="f in installed" :key="f" :value="f">{{ f }}</option>
    </select>
  </label>
  <div class="row zoom-row">
    <span>{{ $t('editorText.zoom') }}</span>
    <span class="zoom-controls">
      <button
        class="btn btn-sm btn-icon"
        :aria-label="$t('editorText.zoomOut')"
        @click="ui.zoomDiff(-1)"
      >
        <AppIcon name="minus" />
      </button>
      <span class="zoom-level">{{ zoomLabel(ui.diffZoom) }}</span>
      <button
        class="btn btn-sm btn-icon"
        :aria-label="$t('editorText.zoomIn')"
        @click="ui.zoomDiff(1)"
      >
        <AppIcon name="plus" />
      </button>
      <button class="btn btn-sm" @click="ui.zoomDiff(0)">{{ $t('shortcutCapture.reset') }}</button>
    </span>
  </div>
  <p class="hint">{{ $t('editorText.shortcuts', { mod: MOD }) }}</p>
  <div
    class="font-preview"
    :style="{ fontFamily: previewFace, '--diff-zoom': ui.diffZoom }"
    aria-hidden="true"
  >
    <div v-for="line in PREVIEW" :key="line">{{ line }}</div>
  </div>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
<style scoped src="./styles/EditorTextSetting.css"></style>
