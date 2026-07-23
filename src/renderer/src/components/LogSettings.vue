<script setup>
import { computed, onMounted, ref } from 'vue'
import { useArmedAction } from '../composables/useArmedAction'

// The "Logs" settings pane: where the local error log lives, plus reveal/clear.
// All fs work is in the main process (window.api.log*) — the renderer only
// triggers it and shows the current path.
const dir = ref('')
const isDefault = ref(true)
const busy = ref(false)
const cleared = ref(false)

async function refresh() {
  const res = await window.api.logDirGet()
  dir.value = res.dir
  isDefault.value = res.isDefault
}
onMounted(refresh)

async function choose() {
  busy.value = true
  try {
    const res = await window.api.logDirChoose()
    if (res.ok) await refresh()
  } finally {
    busy.value = false
  }
}
async function reset() {
  busy.value = true
  try {
    await window.api.logDirReset()
    await refresh()
  } finally {
    busy.value = false
  }
}
function reveal() {
  window.api.revealLog()
}

// Deleting the logs is destructive and irreversible, so it's a two-step confirm
// (first click arms, second click within the window actually clears).
async function doClear() {
  await window.api.clearLog()
  cleared.value = true
  setTimeout(() => (cleared.value = false), 1500)
}
const { armed: clearArmed, trigger: requestClear } = useArmedAction(doClear)
const clearLabel = computed(() =>
  cleared.value ? 'Cleared' : clearArmed.value ? 'Confirm clear' : 'Clear logs'
)
</script>

<template>
  <section>
    <h4>Logs</h4>
    <p class="dialog-note">
      Diff Bro writes unexpected errors to a local log so you can paste it into a bug report. One
      file per day is kept for a week, and <strong>nothing is ever sent anywhere</strong>. Choose
      where the log files are stored.
    </p>
    <div class="path">
      <code :title="dir">{{ dir }}</code>
      <span v-if="isDefault" class="badge">default</span>
    </div>
    <div class="dialog-actions">
      <button class="btn btn-ghost" :disabled="busy" @click="reveal">Reveal</button>
      <button
        class="btn btn-ghost"
        :class="{ armed: clearArmed }"
        :title="
          clearArmed
            ? 'Click again to permanently delete every log file'
            : 'Delete all local log files'
        "
        @click="requestClear"
      >
        {{ clearLabel }}
      </button>
      <button class="btn btn-ghost" :disabled="busy || isDefault" @click="reset">Use default</button>
      <button class="btn btn-primary" :disabled="busy" @click="choose">Change folder…</button>
    </div>
  </section>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
