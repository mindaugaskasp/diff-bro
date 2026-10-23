<script setup>
import { computed, onMounted, ref } from 'vue'
import { useClaudeStore } from '../claudeStore'
import ClaudeAppRow from './ClaudeAppRow.vue'

defineProps({ setup: { type: Object, required: true } })

const claude = useClaudeStore()
onMounted(() => claude.loadApps())

const RESULT_KEYS = {
  code: { ok: 'claude.settings.doneCode', 'cli-failed': 'claude.settings.failCli' },
  desktop: { ok: 'claude.settings.doneDesktop', 'unreadable-config': 'claude.settings.failConfig' }
}
const resultFor = (target) => {
  const r = claude.connectResult
  if (r?.target !== target) return ''
  return RESULT_KEYS[target][r.outcome] ?? 'claude.settings.notInstalled'
}
const apps = computed(() => claude.apps)

const copied = ref('')
async function copy(which, text) {
  await window.api.copyText(text)
  copied.value = which
}
</script>

<template>
  <h4>{{ $t('claude.settings.connectTitle') }}</h4>
  <div v-if="apps" class="app-rows">
    <ClaudeAppRow
      label-key="claude.settings.appCode"
      :state="apps.code"
      :busy="claude.connecting === 'code'"
      :result-key="resultFor('code')"
      @connect="claude.connectApp('code')"
    />
    <ClaudeAppRow
      v-if="apps.desktop"
      label-key="claude.settings.appDesktop"
      :state="apps.desktop"
      :busy="claude.connecting === 'desktop'"
      :result-key="resultFor('desktop')"
      @connect="claude.connectApp('desktop')"
    />
  </div>

  <p class="setup-label setup-manual">{{ $t('claude.settings.manualTitle') }}</p>
  <p class="setup-label">{{ $t('claude.settings.claudeCode') }}</p>
  <div class="setup-block">
    <code>{{ setup.cli }}</code>
    <button type="button" class="btn btn-sm" @click="copy('cli', setup.cli)">
      {{ copied === 'cli' ? $t('common.copied') : $t('common.copy') }}
    </button>
  </div>
  <p class="setup-label">{{ $t('claude.settings.claudeDesktop') }}</p>
  <div class="setup-block">
    <pre><code>{{ setup.desktopJson }}</code></pre>
    <button type="button" class="btn btn-sm" @click="copy('json', setup.desktopJson)">
      {{ copied === 'json' ? $t('common.copied') : $t('common.copy') }}
    </button>
  </div>
</template>

<style scoped src="../../../components/styles/SettingsDialog.css"></style>
<style scoped src="./styles/ClaudeSetup.css"></style>
