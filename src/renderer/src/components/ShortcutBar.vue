<script setup>
import { useSettingsStore } from '../stores/settingsStore'
import { SHORTCUT_BAR } from '../utils/shortcuts'
import AppIcon from './AppIcon.vue'

// Translucent hint pill floating over the diff area; visibility is a persisted
// setting.
const settings = useSettingsStore()

const shortcuts = SHORTCUT_BAR

function dismiss() {
  settings.setShowShortcutBar(false)
}
</script>

<template>
  <div v-if="settings.showShortcutBar" class="shortcut-bar">
    <span v-for="{ keys, labelKey } in shortcuts" :key="keys" class="hint">
      <kbd>{{ keys }}</kbd> {{ $t(labelKey) }}
    </span>
    <button
      class="close"
      :data-tip="$t('shortcutBar.hideTip')"
      :aria-label="$t('shortcutBar.hideLabel')"
      @click="dismiss"
    >
      <AppIcon name="x" />
    </button>
  </div>
</template>

<style scoped src="./styles/ShortcutBar.css"></style>
