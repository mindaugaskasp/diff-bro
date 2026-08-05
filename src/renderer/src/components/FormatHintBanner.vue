<script setup>
// Thin renderer of diffStore.formatBanner (one banner covering both sides).
import { computed } from 'vue'
import { useDiffStore } from '../stores/diffStore'

const store = useDiffStore()
const banner = computed(() => store.formatBanner)
</script>

<template>
  <div v-if="banner" class="hint" :class="{ invalid: banner.invalid }">
    <span class="msg">{{ banner.message }}</span>
    <div class="actions">
      <button v-if="banner.formatBoth" class="format" @click="store.formatBoth()">
        {{ $t('formatHintBanner.formatBoth') }}
      </button>
      <button
        v-else-if="banner.formatSide"
        class="format"
        @click="store.formatSide(banner.formatSide)"
      >
        {{ banner.formatLabel }}
      </button>
      <button class="dismiss" @click="store.dismissFormatHints(banner.dismissSides)">
        {{ $t('formatHintBanner.dismiss') }}
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/FormatHintBanner.css"></style>
