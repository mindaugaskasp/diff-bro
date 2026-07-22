<script setup>
import { useSettingsStore } from '../stores/settingsStore'
import { SHORTCUT_BAR } from '../utils/shortcuts'

// Translucent hint pill floating over the bottom of the diff area — it never
// takes layout space and never covers the top of the content, where the diff
// actually starts. Visibility is a persisted setting (Settings → Interface),
// so the hidden bar can be brought back without editing storage by hand.
const settings = useSettingsStore()

const shortcuts = SHORTCUT_BAR

function dismiss() {
  settings.setShowShortcutBar(false)
}
</script>

<template>
  <div v-if="settings.showShortcutBar" class="shortcut-bar">
    <span v-for="[keys, label] in shortcuts" :key="keys" class="hint">
      <kbd>{{ keys }}</kbd> {{ label }}
    </span>
    <button class="close" title="Hide shortcuts" @click="dismiss">×</button>
  </div>
</template>

<style scoped src="./styles/ShortcutBar.css"></style>
