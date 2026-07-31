<script setup>
import { useDiffStore } from '../stores/diffStore'
import AppIcon from './AppIcon.vue'

// Each tile opens the picker filtered to that format, into the first free side.
// `format` is a key main resolves (src/main/fileFilters.js) — the renderer never
// supplies the filter itself. Everything non-.xlsx still diffs as text, so every
// dialog keeps an "All files" entry.
const FORMATS = [
  { label: 'Excel', ext: '.xlsx', icon: 'table', format: 'xlsx', featured: true },
  { label: 'JSON', icon: 'code', format: 'json' },
  { label: 'XML', icon: 'code', format: 'xml' },
  { label: 'YAML', icon: 'code', format: 'yaml' },
  { label: 'CSV', icon: 'table', format: 'csv' },
  { label: 'Markdown', icon: 'file', format: 'markdown' }
]

const store = useDiffStore()
</script>

<template>
  <div class="formats">
    <span class="eyebrow">Supported files</span>
    <ul class="chips">
      <li v-for="f in FORMATS" :key="f.label">
        <button
          class="chip"
          :class="{ featured: f.featured }"
          :title="`Open ${f.label} file`"
          @click="store.pickFormat(f.format)"
        >
          <AppIcon :name="f.icon" />
          <span>{{ f.label }}</span>
          <span v-if="f.ext" class="ext">{{ f.ext }}</span>
        </button>
      </li>
    </ul>
    <p class="tail">…and any text or code file — binary files aren’t supported</p>
  </div>
</template>

<style scoped src="./styles/SupportedFormats.css"></style>
