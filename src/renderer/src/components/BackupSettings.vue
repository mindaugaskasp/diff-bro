<script setup>
// Rolling local backups. On by default, because the failure it covers — a store
// file going bad — gives no warning and takes work you cannot recreate.
import { computed, onMounted, ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { BACKUP_HOURS } from '../utils/settingsDefaults'
import { ago } from '../utils/relativeTime'
import { byteSize } from '../utils/byteSize'
import SettingToggle from './SettingToggle.vue'
import SegmentedControl from './SegmentedControl.vue'

const settings = useSettingsStore()
const backups = ref([])
const busy = ref(false)
const restored = ref(null)
const confirming = ref('')

const refresh = async () => (backups.value = (await window.api.listBackups()) ?? [])
onMounted(refresh)

const latest = computed(() => backups.value[0] ?? null)

// What the backups are costing, and what a prune would give back — named before
// it happens, so the button is never a guess.
const AGES = [
  { value: '7', label: '1 week' },
  { value: '14', label: '2 weeks' }
]
const age = ref('7')
const used = computed(() => backups.value.reduce((n, b) => n + (b.bytes ?? 0), 0))
const stale = computed(() => {
  const cutoff = Date.now() - Number(age.value) * 86_400_000
  return backups.value.filter((b) => b.at < cutoff)
})
const staleBytes = computed(() => stale.value.reduce((n, b) => n + (b.bytes ?? 0), 0))

async function prune() {
  busy.value = true
  await window.api.pruneBackups(Number(age.value))
  busy.value = false
  await refresh()
}

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
    <h4>{{ $t('backupSettings.backups') }}</h4>
    <p class="dialog-note">
      {{ $t('backupSettings.keepsARollingCopyOf') }}
    </p>

    <SettingToggle :checked="settings.autoBackup" @change="settings.setAutoBackup">
      {{ $t('backupSettings.backUpAutomatically') }}
    </SettingToggle>

    <label v-if="settings.autoBackup" class="every">
      <span>{{ $t('backupSettings.atMostOnceEvery') }}</span>
      <select
        :value="settings.autoBackupHours"
        @change="settings.setAutoBackupHours($event.target.value)"
      >
        <option v-for="h in BACKUP_HOURS" :key="h" :value="h">{{ hoursLabel(h) }}</option>
      </select>
    </label>
    <p v-if="settings.autoBackup" class="hint">
      {{ $t('backupSettings.takenAfterASaveNever') }}
    </p>

    <p v-if="latest" class="hint">
      {{
        $t('backupSettings.lastBackup', {
          when: ago(latest.at),
          kept: backups.length,
          size: byteSize(used)
        })
      }}
    </p>
    <p v-else class="hint">{{ $t('backupSettings.noBackupsYet') }}</p>

    <!-- The button names its consequence, not just "clear old backups". -->
    <div v-if="backups.length" class="prune">
      <SegmentedControl
        v-model:value="age"
        compact
        :label="$t('backupSettings.olderThan')"
        :options="AGES"
      />
      <button class="btn btn-sm" :disabled="busy || !stale.length" @click="prune">
        {{
          stale.length
            ? $t('backupSettings.deleteStale', stale.length, { size: byteSize(staleBytes) })
            : $t('backupSettings.nothingThatOld')
        }}
      </button>
    </div>

    <div v-if="backups.length" class="restore">
      <button
        v-for="b in backups"
        :key="b.name"
        class="btn btn-sm"
        :disabled="busy"
        @click="confirming = b.name"
      >
        {{ $t('backupSettings.restoreFrom', { when: ago(b.at) }) }}
      </button>
    </div>

    <template v-if="confirming">
      <p class="dialog-note warn">
        {{ $t('backupSettings.restoringReplacesYourSnippetsAnd') }}
      </p>
      <div class="dialog-actions">
        <button class="btn btn-destructive btn-sm" :disabled="busy" @click="restore(confirming)">
          {{ $t('backupSettings.replaceThem') }}
        </button>
        <button class="btn btn-ghost btn-sm" @click="confirming = ''">
          {{ $t('common.cancel') }}
        </button>
      </div>
    </template>

    <p v-if="restored" class="hint">
      {{ $t('backupSettings.restored', { diffs: restored.diffs, snippets: restored.snippets }) }}
    </p>
  </section>
</template>

<style scoped src="./styles/BackupSettings.css"></style>
