<script setup>
import AppIcon from './AppIcon.vue'

const reveal = () => window.api.storeReveal('snippets')
</script>

<template>
  <button
    class="row-btn"
    :data-tip="$t('showInFolder.tip')"
    :aria-label="$t('showInFolder.label')"
    @click="reveal"
  >
    <AppIcon name="folder" />
  </button>
</template>
