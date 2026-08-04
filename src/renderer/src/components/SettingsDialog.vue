<script setup>
import { ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { THEMES } from '../utils/themes'
import BaseDialog from './BaseDialog.vue'
import LogSettings from './LogSettings.vue'
import CliSettings from './CliSettings.vue'
import GitToolSettings from './GitToolSettings.vue'
import SettingToggle from './SettingToggle.vue'
import ShortcutCapture from './ShortcutCapture.vue'
import SettingsLimits from './SettingsLimits.vue'
import StorageSettings from './StorageSettings.vue'
import { EmailSettings } from '../features/email'
import { useOnboardingStore } from '../features/onboarding'
import { useUiStore } from '../stores/uiStore'

const ui = useUiStore()
const settings = useSettingsStore()
const tour = useOnboardingStore()

// One pane shows at a time behind the left rail.
const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'storage', label: 'Storage' },
  { id: 'limits', label: 'Limits' },
  { id: 'logs', label: 'Logs' },
  { id: 'email', label: 'Email' },
  { id: 'cli', label: 'Terminal' },
  { id: 'fun', label: 'Fun' }
]

// Re-resolve the active theme so the rotation toggle applies immediately.
function toggleDailyTheme(on) {
  settings.setRotateThemeDaily(on)
  settings.resolveActiveTheme()
}
const tab = ref('appearance')

function close() {
  ui.showSettingsDialog = false
}
</script>

<template>
  <BaseDialog width="580px" title="Settings" @close="close">
    <div class="settings-body">
      <nav class="settings-nav" aria-label="Settings sections">
        <button
          v-for="t in TABS"
          :key="t.id"
          type="button"
          class="nav-item"
          :class="{ active: tab === t.id }"
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
      </nav>

      <div class="settings-pane">
        <section v-if="tab === 'appearance'">
          <h4>Theme</h4>
          <div class="theme-grid">
            <button
              v-for="t in THEMES"
              :key="t.id"
              type="button"
              class="theme-opt"
              :class="{ active: settings.theme === t.id }"
              :data-tip="`Use the ${t.label} theme`"
              :aria-label="`Use the ${t.label} theme`"
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
          <SettingToggle :checked="settings.showShortcutBar" @change="settings.setShowShortcutBar">
            Show the keyboard-shortcut bar over diffs
          </SettingToggle>
          <SettingToggle :checked="settings.shutterSound" @change="settings.setShutterSound">
            Play a shutter sound when a diff image is captured
          </SettingToggle>
          <SettingToggle :checked="settings.maximizeDialogs" @change="settings.setMaximizeDialogs">
            Maximize tool &amp; snippet windows (turn off to restore each one's size)
          </SettingToggle>
          <div class="tips-row" data-tour="tips">
            <SettingToggle :checked="tour.showTips" @change="tour.setShowTips">
              Show tips after an update
            </SettingToggle>
            <button class="btn btn-sm" @click="tour.replay()">Show tour</button>
          </div>
        </section>

        <section v-else-if="tab === 'shortcuts'">
          <h4>Quick look-up</h4>
          <p class="dialog-note">
            A floating search that finds any snippet or saved diff without raising the main window —
            it works even when Diff Bro is minimized. Click the field, then press the key
            combination you want.
          </p>
          <ShortcutCapture />
        </section>

        <StorageSettings v-else-if="tab === 'storage'" />

        <LogSettings v-else-if="tab === 'logs'" />

        <EmailSettings v-else-if="tab === 'email'" />

        <template v-else-if="tab === 'cli'">
          <CliSettings />
          <GitToolSettings />
        </template>

        <section v-else-if="tab === 'fun'">
          <h4>Fun</h4>
          <label class="row toggle">
            <input
              type="checkbox"
              :checked="settings.rotateThemeDaily"
              @change="toggleDailyTheme($event.target.checked)"
            />
            <span>Rotate the app theme daily — a new random theme each day</span>
          </label>
          <p class="hint">
            Off by default. When off, Diff Bro uses the theme you picked under Appearance. The daily
            theme is the same all day and changes at midnight.
          </p>
        </section>

        <SettingsLimits v-else />
      </div>
    </div>

    <template #actions>
      <button class="btn btn-ghost" @click="close">Close</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
