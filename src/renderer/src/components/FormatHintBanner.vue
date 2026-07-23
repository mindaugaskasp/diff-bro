<script setup>
// One banner for both sides. When both are minified JSON/XML it reads "Both
// sides look like JSON — pretty-print?" with a single Format-both action; a
// mixed or single-side case names the side(s). The merge lives in the store
// (diffStore.formatBanner) so this stays a thin renderer.
import { computed } from 'vue'
import { useDiffStore } from '../stores/diffStore'

const store = useDiffStore()
const banner = computed(() => store.formatBanner)
</script>

<template>
  <div v-if="banner" class="hint" :class="{ invalid: banner.invalid }">
    <span class="msg">{{ banner.message }}</span>
    <div class="actions">
      <button v-if="banner.formatBoth" class="format" @click="store.formatBoth()">Format both</button>
      <button
        v-else-if="banner.formatSide"
        class="format"
        @click="store.formatSide(banner.formatSide)"
      >
        {{ banner.formatLabel }}
      </button>
      <button class="dismiss" @click="store.dismissFormatHints(banner.dismissSides)">Dismiss</button>
    </div>
  </div>
</template>

<style scoped src="./styles/FormatHintBanner.css"></style>
