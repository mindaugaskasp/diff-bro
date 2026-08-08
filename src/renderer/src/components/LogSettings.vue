<script setup>
import { t } from '../i18n'
import { computed, onMounted, ref } from 'vue'
import { useArmedAction } from '../composables/useArmedAction'

// The "Logs" settings pane (fs work is in main via window.api.log*).
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

// Two-step confirm — deleting the logs is irreversible.
async function doClear() {
  await window.api.clearLog()
  cleared.value = true
  setTimeout(() => (cleared.value = false), 1500)
}
const { armed: clearArmed, trigger: requestClear } = useArmedAction(doClear)
const clearLabel = computed(() =>
  cleared.value
    ? t('logSettings.cleared')
    : clearArmed.value
      ? t('logSettings.confirmClear')
      : t('logSettings.clearLogs')
)
</script>

<template>
  <section>
    <h4>{{ $t('logSettings.logs') }}</h4>
    <i18n-t keypath="logSettings.intro" tag="p" class="dialog-note">
      <template #never
        ><strong>{{ $t('logSettings.neverSent') }}</strong></template
      >
    </i18n-t>
    <div class="path">
      <code :title="dir">{{ dir }}</code>
      <span v-if="isDefault" class="badge">{{ $t('logSettings.default') }}</span>
    </div>
    <div class="dialog-actions">
      <button class="btn" :disabled="busy" @click="reveal">{{ $t('logSettings.reveal') }}</button>
      <button
        class="btn"
        :class="{ armed: clearArmed }"
        :data-tip="
          clearArmed
            ? $t('logSettings.clickAgainToPermanently')
            : $t('logSettings.deleteAllLocalLog')
        "
        @click="requestClear"
      >
        {{ clearLabel }}
      </button>
      <button class="btn" :disabled="busy || isDefault" @click="reset">
        {{ $t('logSettings.useDefault') }}
      </button>
      <button class="btn btn-primary" :disabled="busy" @click="choose">
        {{ $t('logSettings.changeFolder') }}
      </button>
    </div>
  </section>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
