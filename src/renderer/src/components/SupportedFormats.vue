<script setup>
import AppIcon from './AppIcon.vue'

// Shown under the empty-state prompt so it's obvious what can be dropped. Only
// .xlsx gets the structural grid diff; everything else diffs as text, so this
// list is illustrative, not exhaustive — hence the trailing "& any text or code
// file". `featured` highlights the headline capability (Excel).
const FORMATS = [
  { label: 'Excel', ext: '.xlsx', icon: 'table', featured: true },
  { label: 'JSON', icon: 'code' },
  { label: 'XML', icon: 'code' },
  { label: 'YAML', icon: 'code' },
  { label: 'CSV', icon: 'table' },
  { label: 'Markdown', icon: 'file' }
]
</script>

<template>
  <div class="formats">
    <span class="eyebrow">Supported files</span>
    <ul class="chips">
      <li v-for="f in FORMATS" :key="f.label" class="chip" :class="{ featured: f.featured }">
        <AppIcon :name="f.icon" />
        <span>{{ f.label }}</span>
        <span v-if="f.ext" class="ext">{{ f.ext }}</span>
      </li>
    </ul>
    <p class="tail">…and any text or code file — binary files aren’t supported</p>
  </div>
</template>

<style scoped src="./styles/SupportedFormats.css"></style>
