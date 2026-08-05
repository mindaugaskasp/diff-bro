<script setup>
// A new binding goes through main FIRST — it owns the OS registration and
// reports if the combo is taken — and only a success persists.
import { computed, ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { DEFAULT_QUICKLOOK_SHORTCUT } from '../utils/settingsDefaults'
import { acceleratorFromEvent, isValidAccelerator, acceleratorLabel } from '../utils/accelerator'
import { isMac } from '../keys'

const settings = useSettingsStore()
const capturing = ref(false)
const message = ref(null) // { type: 'error' | 'ok', text }

const label = computed(() => acceleratorLabel(settings.quickLookShortcut, isMac))
const isDefault = computed(() => settings.quickLookShortcut === DEFAULT_QUICKLOOK_SHORTCUT)

function start() {
  capturing.value = true
  message.value = null
}
function stop() {
  capturing.value = false
}

async function apply(accel) {
  const res = await window.api.quickLookSetShortcut(accel)
  capturing.value = false
  if (res?.ok) {
    settings.setQuickLookShortcut(accel)
    message.value = { type: 'ok', text: 'Shortcut updated.' }
    return
  }
  message.value = {
    type: 'error',
    text:
      res?.error === 'unavailable'
        ? 'That combination is already in use by another app — try another.'
        : 'That shortcut can’t be used — try another.'
  }
}

function onKeydown(e) {
  if (!capturing.value) return
  e.preventDefault()
  if (e.key === 'Escape') return stop()
  const accel = acceleratorFromEvent(e)
  if (!accel || !isValidAccelerator(accel)) {
    message.value = {
      type: 'error',
      text: 'Hold a modifier (Ctrl/Cmd, Alt, or Shift) and press a key.'
    }
    return
  }
  apply(accel)
}
</script>

<template>
  <div class="shortcut-capture">
    <button
      type="button"
      class="capture-field"
      :class="{ capturing }"
      @click="start"
      @keydown="onKeydown"
      @blur="stop"
    >
      <span v-if="capturing" class="prompt">
        Press a key combination… <span class="esc">Esc to cancel</span>
      </span>
      <kbd v-else>{{ label }}</kbd>
    </button>
    <button
      v-if="!isDefault"
      type="button"
      class="btn btn-sm"
      @click="apply(DEFAULT_QUICKLOOK_SHORTCUT)"
    >
      Reset
    </button>
  </div>
  <p v-if="message" class="capture-msg" :class="message.type">{{ message.text }}</p>
</template>

<style scoped src="./styles/ShortcutCapture.css"></style>
