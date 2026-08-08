<script setup>
import { ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { isWindows } from '../keys'
import BaseDialog from './BaseDialog.vue'
import DesktopSettings from './DesktopSettings.vue'
import LogSettings from './LogSettings.vue'
import CliSettings from './CliSettings.vue'
import GitToolSettings from './GitToolSettings.vue'
import SettingsAppearance from './SettingsAppearance.vue'
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

// One pane at a time behind the left rail. Desktop needs a tray, so elsewhere it
// would be two settings that do nothing. Filtered once — the platform is fixed.
// Literal keys, so check:i18n can see the call sites; resolved in a computed
// because a t() at module load freezes whatever locale the app started in.
const TABS = [
  { id: 'appearance', labelKey: 'settingsDialog.tab.appearance' },
  { id: 'shortcuts', labelKey: 'settingsDialog.tab.shortcuts' },
  { id: 'desktop', labelKey: 'settingsDialog.tab.desktop', windowsOnly: true },
  { id: 'storage', labelKey: 'settingsDialog.tab.storage' },
  { id: 'limits', labelKey: 'settingsDialog.tab.limits' },
  { id: 'logs', labelKey: 'settingsDialog.tab.logs' },
  { id: 'email', labelKey: 'settingsDialog.tab.email' },
  { id: 'cli', labelKey: 'settingsDialog.tab.cli' },
  { id: 'fun', labelKey: 'settingsDialog.tab.fun' }
].filter((t) => isWindows || !t.windowsOnly)

// Re-resolve the active theme so the rotation toggle applies immediately.
function toggleDailyTheme(on) {
  settings.setRotateThemeDaily(on)
  settings.resolveActiveTheme()
}
const known = (id) => TABS.some((t) => t.id === id)
const tab = ref(known(ui.settingsTab) ? ui.settingsTab : 'appearance')
// The dialog stays mounted while it is open, so reading the store once at setup
// meant asking for a pane from an ALREADY OPEN Settings did nothing.
watch(
  () => ui.settingsTab,
  (id) => {
    if (known(id)) tab.value = id
  }
)

function close() {
  ui.showSettingsDialog = false
}
</script>

<template>
  <BaseDialog width="870px" tour="settings" :title="$t('settingsDialog.settings')" @close="close">
    <div class="settings-body">
      <nav
        class="settings-nav"
        :aria-label="$t('settingsDialog.settingsSections')"
        data-tour="settings-nav"
      >
        <button
          v-for="t in TABS"
          :key="t.id"
          type="button"
          class="nav-item"
          :class="{ active: tab === t.id }"
          @click="tab = t.id"
        >
          {{ $t(t.labelKey) }}
        </button>
      </nav>

      <div class="settings-pane">
        <SettingsAppearance v-if="tab === 'appearance'">
          <template #tips>
            <div class="tips-row" data-tour="tips">
              <SettingToggle :checked="tour.showTips" @change="tour.setShowTips">
                {{ $t('settingsDialog.showTipsAfterAnUpdate') }}
              </SettingToggle>
              <button
                class="btn btn-sm"
                :disabled="tour.active"
                :data-tip="
                  tour.active
                    ? $t('settingsDialog.theTourIsRunning')
                    : $t('settingsDialog.runTheTourAgain')
                "
                @click="tour.replay()"
              >
                {{ $t('settingsDialog.showTour') }}
              </button>
            </div>
          </template>
        </SettingsAppearance>

        <section v-else-if="tab === 'shortcuts'">
          <h4>{{ $t('settingsDialog.quickLookUp') }}</h4>
          <p class="dialog-note">
            {{ $t('settingsDialog.aFloatingSearchThatFinds') }}
          </p>
          <ShortcutCapture />
        </section>

        <DesktopSettings v-else-if="tab === 'desktop'" />

        <StorageSettings v-else-if="tab === 'storage'" />

        <LogSettings v-else-if="tab === 'logs'" />

        <EmailSettings v-else-if="tab === 'email'" />

        <template v-else-if="tab === 'cli'">
          <CliSettings />
          <GitToolSettings />
        </template>

        <section v-else-if="tab === 'fun'">
          <h4>{{ $t('settingsDialog.fun') }}</h4>
          <label class="row toggle">
            <input
              type="checkbox"
              :checked="settings.rotateThemeDaily"
              @change="toggleDailyTheme($event.target.checked)"
            />
            <span>{{ $t('settingsDialog.rotateTheAppThemeDaily') }}</span>
          </label>
          <p class="hint">
            {{ $t('settingsDialog.offByDefaultWhenOff') }}
          </p>
        </section>

        <SettingsLimits v-else />
      </div>
    </div>

    <template #actions>
      <button class="btn btn-ghost" @click="close">{{ $t('common.close') }}</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
