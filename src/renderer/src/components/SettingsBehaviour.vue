<script setup>
import { useSettingsStore } from '../stores/settingsStore'
import SettingToggle from './SettingToggle.vue'

const settings = useSettingsStore()
</script>

<template>
  <section class="settings-behaviour">
    <h4>{{ $t('settingsAppearance.behaviour') }}</h4>
    <SettingToggle :checked="settings.showRowTags" @change="settings.setShowRowTags">
      {{ $t('settingsDialog.showTagsOnSidebarRows') }}
    </SettingToggle>
    <p class="hint">{{ $t('settingsAppearance.rowTagsHint') }}</p>
    <SettingToggle :checked="settings.shutterSound" @change="settings.setShutterSound">
      {{ $t('settingsDialog.playAShutterSoundWhen') }}
    </SettingToggle>
    <SettingToggle :checked="settings.maximizeDialogs" @change="settings.setMaximizeDialogs">
      {{ $t('settingsDialog.maximizeToolSnippet') }}
    </SettingToggle>
  </section>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
