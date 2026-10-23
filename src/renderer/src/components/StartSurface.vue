<script setup>
// A blank comparison, drawn as a place to start rather than a tab of work.
import { useDiffStore } from '../stores/diffStore'
import { useSnippetStore } from '../stores/snippetStore'
import { MOD } from '../keys'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()
const snippets = useSnippetStore()

// `format` is a key main resolves to a dialog filter; the renderer never names one.
const FORMATS = [
  { label: 'Excel', format: 'xlsx' },
  { label: 'CSV', format: 'csv' },
  { label: 'JSON', format: 'json' },
  { label: 'YAML', format: 'yaml' },
  { label: 'XML', format: 'xml' },
  { label: 'Markdown', format: 'markdown' },
  { label: 'Mermaid', format: 'mermaid' }
]

const newSnippet = () => (snippets.editingSnippet = { id: null })
</script>

<template>
  <div class="start">
    <div class="start-col">
      <div class="start-head">
        <h2>{{ $t('startSurface.title') }}</h2>
        <p class="meta">{{ $t('startSurface.subtitle') }}</p>
      </div>
      <div class="start-cards">
        <button type="button" class="start-card" @click="store.pick('left')">
          <span class="glyph-well" data-hue="diff"><AppIcon name="file" /></span>
          <span class="card-title">{{ $t('startSurface.twoFiles') }}</span>
          <span class="meta">{{ $t('startSurface.twoFilesHint') }}</span>
          <span class="keys"
            ><kbd class="ql-kbd">{{ MOD }}+1</kbd><kbd class="ql-kbd">{{ MOD }}+2</kbd></span
          >
        </button>
        <button type="button" class="start-card" @click="store.togglePasteMode()">
          <span class="glyph-well" data-hue="received"><AppIcon name="clipboard" /></span>
          <span class="card-title">{{ $t('startSurface.pastedText') }}</span>
          <span class="meta">{{ $t('startSurface.pastedTextHint') }}</span>
          <span class="keys"
            ><kbd class="ql-kbd">{{ MOD }}+T</kbd></span
          >
        </button>
        <button type="button" class="start-card" @click="newSnippet">
          <span class="glyph-well" data-hue="snippet"><AppIcon name="code" /></span>
          <span class="card-title">{{ $t('startSurface.newSnippet') }}</span>
          <span class="meta">{{ $t('startSurface.newSnippetHint') }}</span>
        </button>
      </div>
      <p class="start-formats meta">
        <button
          v-for="f in FORMATS"
          :key="f.format"
          type="button"
          class="format"
          :data-tip="$t('supportedFormats.openFormatFile', { format: f.label })"
          @click="store.pickFormat(f.format)"
        >
          {{ f.label }}
        </button>
        <span>{{ $t('supportedFormats.andAnyText') }}</span>
      </p>
    </div>
  </div>
</template>

<style scoped src="./styles/StartSurface.css"></style>
