<script setup>
import { ref } from 'vue'
import { SHORTCUT_BAR } from '../utils/shortcuts'

// Translucent hint pill floating over the bottom of the diff area — it never
// takes layout space and never covers the top of the content, where the diff
// actually starts. Dismissal is remembered per install.
const DISMISS_KEY = 'diffbro.shortcutBarDismissed'
const dismissed = ref(localStorage.getItem(DISMISS_KEY) === '1')

const shortcuts = SHORTCUT_BAR

function dismiss() {
  dismissed.value = true
  localStorage.setItem(DISMISS_KEY, '1')
}
</script>

<template>
  <div v-if="!dismissed" class="shortcut-bar">
    <span v-for="[keys, label] in shortcuts" :key="keys" class="hint">
      <kbd>{{ keys }}</kbd> {{ label }}
    </span>
    <button class="close" title="Hide shortcuts" @click="dismiss">×</button>
  </div>
</template>

<style scoped src="./styles/ShortcutBar.css"></style>
