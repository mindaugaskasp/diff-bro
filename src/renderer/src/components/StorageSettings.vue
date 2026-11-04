<script setup>
import { onMounted, ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { useTabsStore } from '../stores/tabsStore'
import SettingToggle from './SettingToggle.vue'
import BackupSettings from './BackupSettings.vue'
import { useDataDirMove } from '../composables/useDataDirMove'

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
const move = useDataDirMove()
async function run(action) {
  busy.value = true
  try {
    await action()
  } finally {
    busy.value = false
  }
}
const choose = () => run(move.choose)
const reset = () => run(move.reset)
function reveal() {
  window.api.dataDirReveal()
}
</script>

<template>
  <section>
    <h4>{{ $t('storageSettings.dataFolder') }}</h4>
    <i18n-t keypath="storageSettings.intro" tag="p" class="dialog-note">
      <template #survives
        ><strong>{{ $t('storageSettings.survivesAReinstall') }}</strong></template
      >
    </i18n-t>
    <div class="path">
      <code :title="dir">{{ dir }}</code>
      <span v-if="isDefault" class="badge">{{ $t('logSettings.default') }}</span>
    </div>
    <div class="dialog-actions">
      <button class="btn" :disabled="busy" @click="reveal">
        {{ $t('storageSettings.reveal') }}
      </button>
      <button class="btn" :disabled="busy || isDefault" @click="reset">
        {{ $t('storageSettings.useDefault') }}
      </button>
      <button class="btn btn-primary" :disabled="busy" @click="choose">
        {{ $t('storageSettings.changeFolder') }}
      </button>
    </div>
    <p class="hint">{{ $t('storageSettings.changingTheFolderRestartsDiff') }}</p>

    <BackupSettings />

    <h4>{{ $t('storageSettings.onLaunch') }}</h4>
    <SettingToggle :checked="settings.restoreSession" @change="tabs.setRestoreSession">
      {{ $t('storageSettings.reopenTheComparisonsThatWere') }}
    </SettingToggle>
    <p class="hint">{{ $t('storageSettings.onByDefaultTurningIt') }}</p>

    <h4>{{ $t('storageSettings.whenTheStripIsFull') }}</h4>
    <SettingToggle :checked="settings.autoCloseOldest" @change="settings.setAutoCloseOldest">
      {{ $t('storageSettings.closeTheOldestComparison') }}
    </SettingToggle>
    <p class="hint">{{ $t('storageSettings.offByDefaultAnUnsaved') }}</p>
  </section>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
