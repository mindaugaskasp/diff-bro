<script setup>
// The Appearance pane: theme grid, language, and the toggles that go with them.
// Its own component so SettingsDialog's template stays inside its cap.
import { useSettingsStore } from '../stores/settingsStore'
import { THEMES } from '../utils/themes'
import { LOCALES } from '../../../shared/i18n'
import SettingToggle from './SettingToggle.vue'

const settings = useSettingsStore()
</script>

<template>
  <section>
    <h4>{{ $t('settingsDialog.theme') }}</h4>
    <div class="theme-grid">
      <button
        v-for="t in THEMES"
        :key="t.id"
        type="button"
        class="theme-opt"
        :class="{ active: settings.theme === t.id }"
        :data-tip="$t('settingsDialog.useTheme', { name: t.label })"
        :aria-label="$t('settingsDialog.useTheme', { name: t.label })"
        @click="settings.setTheme(t.id)"
      >
        <span class="swatch" :style="{ background: t.swatch.bg }">
          <span class="dot" :style="{ background: t.swatch.accent }"></span>
          <span class="dot" :style="{ background: t.swatch.add }"></span>
          <span class="dot" :style="{ background: t.swatch.del }"></span>
        </span>
        <span>{{ t.label }}</span>
      </button>
    </div>
    <label class="language-row">
      <span>{{ $t('settings.language.label') }}</span>
      <select
        :value="settings.activeLocale"
        :aria-label="$t('settings.language.label')"
        @change="settings.setLocale($event.target.value)"
      >
        <option v-for="l in LOCALES" :key="l.id" :value="l.id">{{ l.name }}</option>
      </select>
    </label>
    <p class="dialog-note">{{ $t('settings.language.hint') }}</p>
    <SettingToggle :checked="settings.showShortcutBar" @change="settings.setShowShortcutBar">
      {{ $t('settingsDialog.showTheKeyboardShortcutBar') }}
    </SettingToggle>
    <SettingToggle :checked="settings.shutterSound" @change="settings.setShutterSound">
      {{ $t('settingsDialog.playAShutterSoundWhen') }}
    </SettingToggle>
    <SettingToggle :checked="settings.maximizeDialogs" @change="settings.setMaximizeDialogs">
      {{ $t('settingsDialog.maximizeToolSnippet') }}
    </SettingToggle>
    <slot name="tips" />
  </section>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
