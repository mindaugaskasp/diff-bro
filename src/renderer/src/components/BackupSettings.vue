<script setup>
// Rolling local backups. On by default, because the failure it covers — a store
// file going bad — gives no warning and takes work you cannot recreate.
import { computed, onMounted, ref } from 'vue'
import { BACKUP_HOURS, useSettingsStore } from '../stores/settingsStore'
import { ago } from '../utils/relativeTime'
import SettingToggle from './SettingToggle.vue'

const settings = useSettingsStore()
const backups = ref([])
const busy = ref(false)
const restored = ref(null)
const confirming = ref('')

const refresh = async () => (backups.value = (await window.api.listBackups()) ?? [])
onMounted(refresh)

const latest = computed(() => backups.value[0] ?? null)

async function restore(name) {
  busy.value = true
  const res = await window.api.restoreBackup(name)
  busy.value = false
  confirming.value = ''
  if (res?.ok) restored.value = res
  await refresh()
}

const hoursLabel = (h) => (h === 1 ? 'hour' : h === 24 ? 'day' : `${h} hours`)
</script>

<template>
  <section>
    <h4>Backups</h4>
    <p class="dialog-note">
      Keeps a rolling copy of your snippets and the diffs you chose to keep, so a corrupted store
      isn’t the end of them. Diffs set to expire are left out — they were meant to go.
    </p>

    <SettingToggle :checked="settings.autoBackup" @change="settings.setAutoBackup">
      Back up automatically
    </SettingToggle>

    <label v-if="settings.autoBackup" class="every">
      <span>At most once every</span>
      <select
        :value="settings.autoBackupHours"
        @change="settings.setAutoBackupHours($event.target.value)"
      >
        <option v-for="h in BACKUP_HOURS" :key="h" :value="h">{{ hoursLabel(h) }}</option>
      </select>
    </label>
    <p v-if="settings.autoBackup" class="hint">
      Taken after a save, never on a timer — an app left open all day writes nothing.
    </p>

    <p v-if="latest" class="hint">
      Last backup {{ ago(latest.at) }} ago · {{ backups.length }} kept.
    </p>
    <p v-else class="hint">No backups yet.</p>

    <div v-if="backups.length" class="restore">
      <button
        v-for="b in backups"
        :key="b.name"
        class="btn btn-sm"
        :disabled="busy"
        @click="confirming = b.name"
      >
        Restore {{ ago(b.at) }} ago
      </button>
    </div>

    <template v-if="confirming">
      <p class="dialog-note warn">
        Restoring replaces your snippets and kept diffs with that copy. Anything saved since is
        lost.
      </p>
      <div class="dialog-actions">
        <button class="btn btn-destructive btn-sm" :disabled="busy" @click="restore(confirming)">
          Replace them
        </button>
        <button class="btn btn-ghost btn-sm" @click="confirming = ''">Cancel</button>
      </div>
    </template>

    <p v-if="restored" class="hint">
      Restored {{ restored.diffs }} diffs and {{ restored.snippets }} snippets. Restart Diff Bro to
      see them.
    </p>
  </section>
</template>

<style scoped src="./styles/BackupSettings.css"></style>
