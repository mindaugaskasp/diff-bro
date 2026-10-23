<script setup>
import { onMounted } from 'vue'
import { useClaudeStore, CLAUDE_SCOPES } from '../claudeStore'
import SettingToggle from '../../../components/SettingToggle.vue'
import ClaudeSetup from './ClaudeSetup.vue'
import ClaudeActivity from './ClaudeActivity.vue'

const claude = useClaudeStore()
onMounted(() => claude.loadConnection())

const SCOPE_KEYS = {
  snippets: 'claude.scope.snippets',
  diffs: 'claude.scope.diffs',
  compare: 'claude.scope.compare',
  proposeSnippets: 'claude.scope.proposeSnippets',
  proposeDiffs: 'claude.scope.proposeDiffs'
}

const onMaster = (on) => (on ? claude.requestEnable() : claude.disable())
</script>

<template>
  <section class="claude-settings">
    <h4>{{ $t('claude.settings.title') }}</h4>
    <p class="dialog-note">{{ $t('claude.settings.intro') }}</p>

    <SettingToggle
      :checked="claude.enabled || claude.confirming"
      :disabled="!claude.connection"
      @change="onMaster"
    >
      {{ $t('claude.settings.enable') }}
    </SettingToggle>

    <div
      v-if="claude.confirming"
      class="claude-warning"
      role="alertdialog"
      aria-labelledby="claude-warning-title"
    >
      <p id="claude-warning-title" class="claude-warning-title">
        {{ $t('claude.settings.warningTitle') }}
      </p>
      <ul>
        <li>{{ $t('claude.settings.warningRead') }}</li>
        <li>{{ $t('claude.settings.warningNever') }}</li>
        <li>{{ $t('claude.settings.warningReview') }}</li>
        <li>{{ $t('claude.settings.warningRevoke') }}</li>
      </ul>
      <div class="claude-warning-actions">
        <button type="button" class="btn btn-sm btn-ghost" @click="claude.cancelEnable()">
          {{ $t('common.cancel') }}
        </button>
        <button type="button" class="btn btn-sm btn-primary" @click="claude.confirmEnable()">
          {{ $t('claude.settings.confirm') }}
        </button>
      </div>
    </div>

    <p v-if="claude.error || claude.connection?.keyError" class="claude-error">
      {{ $t('claude.settings.keyError') }}
    </p>

    <template v-if="claude.enabled">
      <h4>{{ $t('claude.settings.scopesTitle') }}</h4>
      <SettingToggle
        v-for="scope in CLAUDE_SCOPES"
        :key="scope"
        :checked="claude.scopes[scope]"
        @change="claude.setScope(scope, $event)"
      >
        {{ $t(SCOPE_KEYS[scope]) }}
      </SettingToggle>

      <ClaudeSetup :setup="claude.connection.setup" />
      <ClaudeActivity />
    </template>
  </section>
</template>

<style scoped src="../../../components/styles/SettingsDialog.css"></style>
<style scoped src="./styles/ClaudeSettings.css"></style>
