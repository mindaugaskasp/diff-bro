<script setup>
// A blank comparison, drawn as a place to start rather than a tab of work.
import { useDiffStore } from '../stores/diffStore'
import { useSnippetStore } from '../stores/snippetStore'

const store = useDiffStore()
const snippets = useSnippetStore()

const newSnippet = () => (snippets.editingSnippet = { id: null })
</script>

<template>
  <div class="start-surface">
    <div class="start-head">
      <h2>{{ $t('startSurface.title') }}</h2>
      <p class="meta">{{ $t('startSurface.subtitle') }}</p>
    </div>
    <div class="start-links" data-tour="start">
      <button type="button" class="start-link" @click="store.pick('left')">
        {{ $t('startSurface.twoFiles') }}
      </button>
      <button type="button" class="start-link" @click="store.togglePasteMode()">
        {{ $t('startSurface.pastedText') }}
      </button>
      <button type="button" class="start-link" @click="newSnippet">
        {{ $t('startSurface.newSnippet') }}
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/StartSurface.css"></style>
