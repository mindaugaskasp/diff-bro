<script setup>
import { ref } from 'vue'

defineProps({ setup: { type: Object, required: true } })

const copied = ref('')
async function copy(which, text) {
  await window.api.copyText(text)
  copied.value = which
}
</script>

<template>
  <h4>{{ $t('claude.settings.connectTitle') }}</h4>
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
