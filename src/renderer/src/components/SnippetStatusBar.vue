<script setup>
import { computed } from 'vue'
import { MOD } from '../keys'
import { useUiStore } from '../stores/uiStore'
import { contentStats } from '../utils/contentStats'
import { parseTemplateVars } from '../utils/templateVars'
import { SNIPPET_LANGUAGES } from '../utils/detectLanguage'
import { zoomLabel } from '../utils/diffZoom'
import AppIcon from './AppIcon.vue'
import TemplateTagsPopover from './TemplateTagsPopover.vue'

const props = defineProps({
  content: { type: String, default: '' },
  language: { type: String, default: 'plaintext' },
  /** @type {import('vue').PropType<{line: number, column: number}|null>} */
  cursor: { type: Object, default: null },
  editing: { type: Boolean, default: false },
  openedFrom: { type: String, default: '' }
})

const ui = useUiStore()
const stats = computed(() => contentStats(props.content))
const fills = computed(() => parseTemplateVars(props.content))
const languageKey = computed(
  () => SNIPPET_LANGUAGES.find((l) => l.id === props.language)?.labelKey ?? null
)
</script>

<template>
  <div class="editor-status">
    <span class="es-side">
      <span v-if="openedFrom" class="es-opened" :data-tip="openedFrom">
        {{ $t('openWith.openedFrom', { folder: openedFrom }) }} ·
      </span>
      <span v-if="editing && cursor">{{ $t('statusBar.position', cursor) }} ·</span>
      <span>
        {{ $t('statusBar.lines', stats.lines) }} ·
        {{ $t('statusBar.characters', stats.characters) }} ·
      </span>
      <TemplateTagsPopover :fills="fills" />
    </span>
    <span class="es-side">
      <button class="es-btn" :aria-label="$t('editorText.zoomOut')" @click="ui.zoomDiff(-1)">
        <AppIcon name="minus" />
      </button>
      <button
        class="es-btn es-level"
        :aria-label="$t('statusBar.resetZoom', { mod: MOD })"
        :data-tip="$t('statusBar.resetZoom', { mod: MOD })"
        @click="ui.zoomDiff(0)"
      >
        {{ zoomLabel(ui.diffZoom) }}
      </button>
      <button class="es-btn" :aria-label="$t('editorText.zoomIn')" @click="ui.zoomDiff(1)">
        <AppIcon name="plus" />
      </button>
      <span class="es-lang">
        <template v-if="languageKey">{{ $t(languageKey) }} ·</template>
        {{ $t('statusBar.encoding') }}
      </span>
    </span>
  </div>
</template>

<style scoped src="./styles/SnippetStatusBar.css"></style>
