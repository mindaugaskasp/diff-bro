<script setup>
// Windows-only window behaviour. The login item is opt-in because it is a
// machine-level change.
import { onMounted, ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import SettingToggle from './SettingToggle.vue'

const settings = useSettingsStore()
// Main owns this one — it is a registry entry, not a stored preference, so it is
// read back from the OS rather than remembered here.
const atLogin = ref(false)

onMounted(async () => {
  atLogin.value = (await window.api.startAtLogin()) === true
})

async function setAtLogin(on) {
  const res = await window.api.setStartAtLogin(on)
  atLogin.value = res?.openAtLogin === true
}
</script>

<template>
  <section>
    <h4>{{ $t('settingsDialog.desktop') }}</h4>

    <SettingToggle :checked="settings.closeToTray" @change="settings.setCloseToTray">
      {{ $t('settingsDialog.keepRunningInTheTray') }}
    </SettingToggle>
    <p class="hint">{{ $t('settingsDialog.keepRunningHint') }}</p>

    <SettingToggle :checked="atLogin" @change="setAtLogin">
      {{ $t('settingsDialog.startWhenISignIn') }}
    </SettingToggle>
    <p class="hint">{{ $t('settingsDialog.startWhenISignInHint') }}</p>
  </section>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
