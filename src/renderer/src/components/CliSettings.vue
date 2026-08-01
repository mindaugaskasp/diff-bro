<script setup>
// Installs the `diffbro` shim. ~/.local/bin needs no admin rights and is already
// on PATH for most shells — when it isn't, saying so is more use than failing
// silently later, so the status line reports it.
import { onMounted, ref } from 'vue'

const status = ref(null)
const busy = ref(false)
const error = ref('')

const refresh = async () => (status.value = await window.api.cliStatus())
onMounted(refresh)

async function run(fn) {
  busy.value = true
  error.value = ''
  const res = await fn()
  if (res && res.ok === false) error.value = res.error || 'Could not write the command.'
  await refresh()
  busy.value = false
}
</script>

<template>
  <section>
    <h4>Terminal command</h4>
    <p class="dialog-note">
      Adds a <code>diffbro</code> command so a comparison can start from a terminal:
      <code>diffbro compare a.json b.json</code>, <code>diffbro create snippet</code>, or
      <code>diffbro cb save</code> to keep what you just copied.
    </p>

    <div v-if="status" class="path">
      <code :title="status.target">{{ status.target }}</code>
      <span v-if="status.installed" class="badge">installed</span>
    </div>

    <p v-if="status?.installed && !status.onPath" class="hint">
      That folder isn’t on your PATH yet — add it to your shell profile to run
      <code>diffbro</code> by name.
    </p>
    <p v-if="error" class="hint">{{ error }}</p>

    <div class="dialog-actions">
      <button
        v-if="status?.installed"
        class="btn btn-ghost"
        :disabled="busy"
        @click="run(window.api.cliRemove)"
      >
        Remove
      </button>
      <button class="btn btn-primary" :disabled="busy" @click="run(window.api.cliInstall)">
        {{ status?.installed ? 'Reinstall' : 'Install' }}
      </button>
    </div>
  </section>
</template>
