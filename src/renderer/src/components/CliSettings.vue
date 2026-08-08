<script setup>
// Installs the `diffbro` shim. ~/.local/bin needs no admin rights and is already
// on PATH for most shells — when it isn't, saying so is more use than failing
// silently later, so the status line reports it.
import { onMounted, ref } from 'vue'
import { t } from '../i18n'

const status = ref(null)
const busy = ref(false)
const error = ref('')

const refresh = async () => (status.value = await window.api.cliStatus())
onMounted(refresh)

// A Vue template resolves identifiers against the component, not global scope,
// and `window` is not one of the globals it allows — reaching window.api from
// the markup gets `undefined` and throws on click.
const install = () => run(window.api.cliInstall)
const uninstall = () => run(window.api.cliRemove)

async function run(fn) {
  busy.value = true
  error.value = ''
  const res = await fn()
  if (res && res.ok === false) error.value = res.error || t('cliSettings.writeFailed')
  await refresh()
  busy.value = false
}
</script>

<template>
  <section>
    <h4>{{ $t('cliSettings.terminalCommand') }}</h4>
    <i18n-t keypath="cliSettings.intro" tag="p" class="dialog-note">
      <template #cmd><code>diffbro</code></template>
      <template #compare><code>diffbro compare a.json b.json</code></template>
      <template #create><code>diffbro create snippet</code></template>
      <template #save><code>diffbro cb save</code></template>
    </i18n-t>

    <div v-if="status" class="path">
      <code :title="status.target">{{ status.target }}</code>
      <span v-if="status.installed" class="badge">{{ $t('cliSettings.installed') }}</span>
    </div>

    <i18n-t
      v-if="status?.installed && !status.onPath"
      keypath="cliSettings.notOnPath"
      tag="p"
      class="hint"
    >
      <template #cmd><code>diffbro</code></template>
    </i18n-t>
    <p v-if="error" class="hint">{{ error }}</p>

    <div class="dialog-actions">
      <button v-if="status?.installed" class="btn" :disabled="busy" @click="uninstall">
        {{ $t('common.remove') }}
      </button>
      <button class="btn btn-primary" :disabled="busy" @click="install">
        {{ status?.installed ? $t('cliSettings.reinstall') : $t('cliSettings.install') }}
      </button>
    </div>
  </section>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
