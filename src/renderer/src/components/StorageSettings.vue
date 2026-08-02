<script setup>
import { onMounted, ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { useTabsStore } from '../stores/tabsStore'
import SettingToggle from './SettingToggle.vue'
import BackupSettings from './BackupSettings.vue'

// The "Storage" settings pane: where this install's data lives, and what comes
// back the next time the app opens.
const settings = useSettingsStore()
const tabs = useTabsStore()
const dir = ref('')
const isDefault = ref(true)
const busy = ref(false)

async function refresh() {
  const res = await window.api.dataDirGet()
  dir.value = res.dir
  isDefault.value = res.isDefault
}
onMounted(refresh)

// Moving the data folder restarts so key caches rebuild from the new location.
async function choose() {
  busy.value = true
  try {
    const res = await window.api.dataDirChoose()
    if (res.ok) await window.api.relaunch()
  } finally {
    busy.value = false
  }
}
async function reset() {
  busy.value = true
  try {
    const res = await window.api.dataDirReset()
    if (res.ok) await window.api.relaunch()
  } finally {
    busy.value = false
  }
}
function reveal() {
  window.api.dataDirReveal()
}
</script>

<template>
  <section>
    <h4>Data folder</h4>
    <p class="dialog-note">
      Where saved diffs, snippets, and your keys are stored. Put it in a folder you control (e.g.
      Documents or a synced folder) so your data <strong>survives a reinstall</strong>. The folder
      is self-contained — after reinstalling, point Diff Bro back at it to restore everything.
    </p>
    <div class="path">
      <code :title="dir">{{ dir }}</code>
      <span v-if="isDefault" class="badge">default</span>
    </div>
    <div class="dialog-actions">
      <button class="btn btn-ghost" :disabled="busy" @click="reveal">Reveal</button>
      <button class="btn btn-ghost" :disabled="busy || isDefault" @click="reset">
        Use default
      </button>
      <button class="btn btn-primary" :disabled="busy" @click="choose">Change folder…</button>
    </div>
    <p class="hint">Changing the folder restarts Diff Bro.</p>

    <BackupSettings />

    <h4>On launch</h4>
    <SettingToggle :checked="settings.restoreSession" @change="tabs.setRestoreSession">
      Reopen the comparisons that were open when I quit
    </SettingToggle>
    <p class="hint">On by default. Turning it off also forgets the ones already stored.</p>
  </section>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
