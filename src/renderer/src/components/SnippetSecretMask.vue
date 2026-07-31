<script setup>
// What stands in for a secret snippet's contents wherever they would otherwise
// be drawn. The mask is a fixed width so it cannot hint at the real length.
import { SECRET_MASK, SECRET_NOTICE } from '../utils/secretSnippet'
import AppIcon from './AppIcon.vue'

defineProps({
  // The hover card and launcher want it compact; the editor fills its pane.
  compact: { type: Boolean, default: false }
})
</script>

<template>
  <div class="secret-mask" :class="{ compact }">
    <span class="sm-dots">{{ SECRET_MASK }}</span>
    <span class="sm-note"><AppIcon name="lock" />{{ SECRET_NOTICE }}</span>
  </div>
</template>

<style scoped src="./styles/SnippetSecretMask.css"></style>
