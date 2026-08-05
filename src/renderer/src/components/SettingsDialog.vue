<script setup>
import { ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import BaseDialog from './BaseDialog.vue'
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
  <BaseDialog width="580px" tour="settings" :title="$t('settingsDialog.settings')" @close="close">
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
          {{ t.label }}
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
