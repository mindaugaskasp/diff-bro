<script setup>
import { onMounted, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import {
  useSettingsStore,
  MAX_COMPARISON_FILE_MB_CAP,
  MAX_SNIPPET_SIZE_KB_CAP
} from '../stores/settingsStore'
import BaseDialog from './BaseDialog.vue'

const diff = useDiffStore()
const settings = useSettingsStore()
const dir = ref('')
const isDefault = ref(true)
const busy = ref(false)

async function refresh() {
  const res = await window.api.dataDirGet()
  dir.value = res.dir
  isDefault.value = res.isDefault
}
onMounted(refresh)

// Changing where data lives moves the files, then restarts so every in-memory
// key cache is rebuilt cleanly from the new location.
async function choose() {
  busy.value = true
  try {
    const res = await window.api.dataDirChoose()
    if (res.ok) await window.api.relaunch()
  } finally {
    busy.value = false
  }
}
async function reset() {
  busy.value = true
  try {
    const res = await window.api.dataDirReset()
    if (res.ok) await window.api.relaunch()
  } finally {
    busy.value = false
  }
}
function reveal() {
  window.api.dataDirReveal()
}
function close() {
  diff.showSettingsDialog = false
}
</script>

<template>
  <BaseDialog width="460px" title="Settings" @close="close">
    <section>
      <h4>Data folder</h4>
      <p class="dialog-note">
        Where saved diffs, snippets, and your keys are stored. Put it in a folder you control (e.g.
        Documents or a synced folder) so your data <strong>survives a reinstall</strong>. The folder
        is self-contained — after reinstalling, point Diff Bro back at it to restore everything.
      </p>
      <div class="path">
        <code :title="dir">{{ dir }}</code>
        <span v-if="isDefault" class="badge">default</span>
      </div>
      <div class="dialog-actions">
        <button class="btn btn-ghost" :disabled="busy" @click="reveal">Reveal</button>
        <button class="btn btn-ghost" :disabled="busy || isDefault" @click="reset">
          Use default
        </button>
        <button class="btn btn-primary" :disabled="busy" @click="choose">Change folder…</button>
      </div>
      <p class="hint">Changing the folder restarts Diff Bro.</p>
    </section>

    <section>
      <h4>Interface</h4>
      <label class="row toggle">
        <input
          type="checkbox"
          :checked="settings.showShortcutBar"
          @change="settings.setShowShortcutBar($event.target.checked)"
        />
        <span>Show the keyboard-shortcut bar over diffs</span>
      </label>
      <label class="row">
        <span>Max comparison file (MB)</span>
        <input
          type="number"
          min="1"
          :max="MAX_COMPARISON_FILE_MB_CAP"
          :value="settings.maxComparisonFileMb"
          @change="settings.setMaxComparisonFileMb($event.target.value)"
        />
      </label>
      <label class="row">
        <span>Max snippet size (KB)</span>
        <input
          type="number"
          min="16"
          :max="MAX_SNIPPET_SIZE_KB_CAP"
          :value="settings.maxSnippetSizeKb"
          @change="settings.setMaxSnippetSizeKb($event.target.value)"
        />
      </label>
      <p class="hint">
        Higher limits let you diff or store bigger content, at the cost of speed — raise them only if
        you need to.
      </p>
    </section>

    <template #actions>
      <button class="btn btn-ghost" @click="close">Close</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
