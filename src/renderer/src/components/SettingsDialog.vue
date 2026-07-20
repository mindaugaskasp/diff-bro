<script setup>
import { onMounted, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'

const diff = useDiffStore()
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
  <div class="backdrop">
    <div class="dialog">
      <div class="dialog-header">
        <h3>Settings</h3>
        <button type="button" class="close-x" aria-label="Close" @click="close">×</button>
      </div>

      <section>
        <h4>Data folder</h4>
        <p class="note">
          Where saved diffs, snippets, and your keys are stored. Put it in a folder you control
          (e.g. Documents or a synced folder) so your data <strong>survives a reinstall</strong>.
          The folder is self-contained — after reinstalling, point Diff Bro back at it to restore
          everything.
        </p>
        <div class="path">
          <code :title="dir">{{ dir }}</code>
          <span v-if="isDefault" class="badge">default</span>
        </div>
        <div class="actions">
          <button class="ghost" :disabled="busy" @click="reveal">Reveal</button>
          <button class="ghost" :disabled="busy || isDefault" @click="reset">Use default</button>
          <button class="primary" :disabled="busy" @click="choose">Change folder…</button>
        </div>
        <p class="hint">Changing the folder restarts Diff Bro.</p>
      </section>

      <div class="footer">
        <button class="ghost" @click="close">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
}
.dialog {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  width: 460px;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
h3 {
  margin: 0;
  font-size: 14px;
}
h4 {
  margin: 0 0 6px;
  font-size: 12.5px;
}
.close-x {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 20px;
  line-height: 1;
  padding: 0 4px;
  cursor: pointer;
}
.close-x:hover {
  color: var(--text);
}
.note {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
}
.note strong {
  color: var(--text);
}
.path {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 9px;
  margin-bottom: 8px;
}
.path code {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--text);
}
.badge {
  flex-shrink: 0;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-hint);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-hint);
}
.footer {
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}
.primary {
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  padding: 6px 14px;
  cursor: pointer;
  font-weight: 600;
}
.primary:disabled {
  opacity: 0.4;
  cursor: default;
}
.ghost {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 12px;
  cursor: pointer;
}
.ghost:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
