<script setup>
// Registers Diff Bro as git's difftool and mergetool. The checkbox IS the
// registration — unticking it removes the launcher and the git config again.
import { onMounted, ref } from 'vue'
import SettingToggle from './SettingToggle.vue'

const status = ref(null)
const busy = ref(false)
const error = ref('')

const refresh = async () => (status.value = await window.api.gitToolStatus())
onMounted(refresh)

async function toggle(on) {
  busy.value = true
  error.value = ''
  const res = on ? await window.api.gitToolRegister() : await window.api.gitToolUnregister()
  if (res && res.ok === false) error.value = res.error || 'Could not change the git configuration.'
  await refresh()
  busy.value = false
}
</script>

<template>
  <section>
    <h4>{{ $t('gitToolSettings.git') }}</h4>
    <p class="dialog-note">
      {{ $t('gitToolSettings.makes') }} <code>git difftool</code> and
      <code>git mergetool</code> open the comparison here instead of in the terminal.
    </p>

    <SettingToggle
      v-if="status?.available"
      :checked="!!status?.registered"
      :disabled="busy"
      @change="toggle"
    >
      {{ $t('gitToolSettings.openGitComparisonsInDiff') }}
    </SettingToggle>
    <p v-else-if="status" class="hint">git isn’t on your PATH, so there is nothing to register.</p>

    <p v-if="status?.registered" class="hint">
      {{ $t('gitToolSettings.aMergeOpensItsTwo') }}
    </p>
    <p v-if="error" class="hint">{{ error }}</p>
  </section>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
