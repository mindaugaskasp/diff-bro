<script setup>
import { useSettingsStore } from '../stores/settingsStore'
import { useOnboardingStore } from '../features/onboarding'
import SettingToggle from './SettingToggle.vue'

const settings = useSettingsStore()
const tour = useOnboardingStore()
defineEmits(['replayTour'])
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
    <div class="tips-row" data-tour="tips">
      <SettingToggle :checked="tour.showTips" @change="tour.setShowTips">
        {{ $t('settingsDialog.showTipsAfterAnUpdate') }}
      </SettingToggle>
      <button
        class="btn btn-sm"
        :disabled="tour.isRunning"
        :data-tip="
          tour.isRunning
            ? $t('settingsDialog.theTourIsRunning')
            : $t('settingsDialog.runTheTourAgain')
        "
        @click="$emit('replayTour')"
      >
        {{ $t('settingsDialog.showTour') }}
      </button>
    </div>
  </section>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
