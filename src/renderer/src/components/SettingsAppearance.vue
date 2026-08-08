<script setup>
// The Appearance pane: theme grid, language, and the toggles that go with them.
// Its own component so SettingsDialog's template stays inside its cap.
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { t } from '../i18n'
import { THEMES } from '../utils/themes'
import { LOCALES } from '../../../shared/i18n'
import SettingToggle from './SettingToggle.vue'
import ThemeTile from './ThemeTile.vue'

const settings = useSettingsStore()

// Grouped by ground, which is the question people arrive with. Seven each.
// A computed, not a const: a t() resolved once at setup freezes the startup
// locale. Literal keys, so check:i18n can see the call sites.
const groups = computed(() => [
  {
    key: 'light',
    label: t('settingsAppearance.groundLight'),
    themes: THEMES.filter((x) => !x.dark)
  },
  { key: 'dark', label: t('settingsAppearance.groundDark'), themes: THEMES.filter((x) => x.dark) }
])
</script>

<template>
  <section class="settings-appearance">
    <h4>{{ $t('settingsDialog.theme') }}</h4>
    <template v-for="group in groups" :key="group.key">
      <p class="group-label">{{ group.label }}</p>
      <div class="theme-grid">
        <ThemeTile
          v-for="entry in group.themes"
          :key="entry.id"
          :theme="entry"
          :active="settings.theme === entry.id"
          @pick="settings.setTheme(entry.id)"
        />
      </div>
    </template>

    <h4>{{ $t('settings.language.label') }}</h4>
    <label class="row">
      <span>{{ $t('settingsAppearance.interfaceLanguage') }}</span>
      <select
        :value="settings.activeLocale"
        :aria-label="$t('settings.language.label')"
        @change="settings.setLocale($event.target.value)"
      >
        <option v-for="l in LOCALES" :key="l.id" :value="l.id">{{ l.name }}</option>
      </select>
    </label>
    <p class="hint">{{ $t('settings.language.hint') }}</p>

    <h4>{{ $t('settingsAppearance.behaviour') }}</h4>
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
