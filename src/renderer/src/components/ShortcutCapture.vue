<script setup>
// A new binding goes through main FIRST — it owns the OS registration and
// reports if the combo is taken — and only a success persists.
import { computed, onBeforeUnmount, ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { DEFAULT_QUICKLOOK_SHORTCUT } from '../utils/settingsDefaults'
import { acceleratorFromEvent, isValidAccelerator, acceleratorLabel } from '../utils/accelerator'
import { isMac } from '../keys'
import { t } from '../i18n'

const settings = useSettingsStore()
const capturing = ref(false)
const message = ref(null) // { type: 'error' | 'ok', text }

const label = computed(() => acceleratorLabel(settings.quickLookShortcut, isMac))
const isDefault = computed(() => settings.quickLookShortcut === DEFAULT_QUICKLOOK_SHORTCUT)

// The global shortcut answers with Diff Bro in front like anywhere else, so the
// one field it would fight — this one — silences it for as long as it is armed.
const listen = (on) => window.api.quickLookCapturingShortcut?.(on)

function start() {
  capturing.value = true
  message.value = null
  listen(true)
}
function stop() {
  capturing.value = false
  listen(false)
}
// Closing Settings mid-capture does not always blur first, and a guard left
// armed silences the summon chord for the rest of the session.
onBeforeUnmount(stop)

async function apply(accel) {
  const res = await window.api.quickLookSetShortcut(accel)
  stop()
  if (res?.ok) {
    settings.setQuickLookShortcut(accel)
    message.value = { type: 'ok', text: t('shortcutCapture.updated') }
    return
  }
  message.value = {
    type: 'error',
    text:
      res?.error === 'unavailable'
        ? t('shortcutCapture.takenByAnotherApp')
        : t('shortcutCapture.unusable')
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
      text: t('shortcutCapture.holdAModifier')
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
        {{ $t('shortcutCapture.pressAKeyCombination') }}
        <span class="esc">{{ $t('shortcutCapture.escToCancel') }}</span>
      </span>
      <kbd v-else>{{ label }}</kbd>
    </button>
    <button
      v-if="!isDefault"
      type="button"
      class="btn btn-sm"
      @click="apply(DEFAULT_QUICKLOOK_SHORTCUT)"
    >
      {{ $t('shortcutCapture.reset') }}
    </button>
  </div>
  <p v-if="message" class="capture-msg" :class="message.type">{{ message.text }}</p>
</template>

<style scoped src="./styles/ShortcutCapture.css"></style>
