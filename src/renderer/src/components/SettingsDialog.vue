<script setup>
import BaseDialog from './BaseDialog.vue'
import DesktopSettings from './DesktopSettings.vue'
import LogSettings from './LogSettings.vue'
import CliSettings from './CliSettings.vue'
import GitToolSettings from './GitToolSettings.vue'
import SettingsAppearance from './SettingsAppearance.vue'
import SettingsBehaviour from './SettingsBehaviour.vue'
import SettingsNav from './SettingsNav.vue'
import ShortcutCapture from './ShortcutCapture.vue'
import SettingsLimits from './SettingsLimits.vue'
import StorageSettings from './StorageSettings.vue'
import { EmailSettings } from '../features/email'
import { ClaudeSettings } from '../features/claude'
import { LanguagesSettings } from '../features/runner'
import { ToursSettings, useOnboardingStore } from '../features/onboarding'
import { useUiStore } from '../stores/uiStore'
import { useSettingsDraft } from '../composables/useSettingsDraft'
import { useSettingsNav } from '../composables/useSettingsNav'
import SettingsUnsavedDialog from './SettingsUnsavedDialog.vue'

const ui = useUiStore()
const tour = useOnboardingStore()
const { groups, nav, showPage, toggleGroup } = useSettingsNav()
const draft = useSettingsDraft({ close: () => (ui.showSettingsDialog = false) })
</script>

<template>
  <BaseDialog
    width="870px"
    tour="settings"
    :escape-closes="false"
    :title="$t('settingsDialog.settings')"
    @close="draft.requestClose()"
  >
    <div class="settings-body">
      <SettingsNav
        :groups="groups"
        :page="nav.page"
        :open="nav.open"
        data-tour="settings-nav"
        @page="showPage"
        @group="toggleGroup"
      />

      <div class="settings-pane">
        <SettingsAppearance v-if="nav.page === 'appearance'" />

        <SettingsBehaviour v-else-if="nav.page === 'behaviour'" />

        <ToursSettings
          v-else-if="nav.page === 'tours'"
          @take="(id) => draft.requestClose(() => tour.take(id))"
        />

        <section v-else-if="nav.page === 'shortcuts'">
          <h4>{{ $t('settingsDialog.quickLookUp') }}</h4>
          <p class="dialog-note">
            {{ $t('settingsDialog.aFloatingSearchThatFinds') }}
          </p>
          <ShortcutCapture />
        </section>

        <DesktopSettings v-else-if="nav.page === 'desktop'" />

        <LanguagesSettings v-else-if="nav.page === 'languages'" />

        <ClaudeSettings v-else-if="nav.page === 'claude'" />

        <template v-else-if="nav.page === 'cli'">
          <CliSettings />
          <GitToolSettings />
        </template>

        <EmailSettings v-else-if="nav.page === 'email'" />

        <StorageSettings v-else-if="nav.page === 'storage'" />

        <LogSettings v-else-if="nav.page === 'logs'" />

        <SettingsLimits v-else />
      </div>
    </div>

    <template #actions>
      <button class="btn btn-ghost" @click="draft.requestClose()">
        {{ $t('common.close') }}
      </button>
      <button class="btn btn-primary" :disabled="!draft.isDirty.value" @click="draft.save()">
        {{ $t('settingsDialog.save') }}
      </button>
    </template>
    <SettingsUnsavedDialog v-if="draft.asking.value" @answer="draft.answer" />
  </BaseDialog>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
