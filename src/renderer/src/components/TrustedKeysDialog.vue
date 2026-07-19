<script setup>
import { onMounted, ref, watch } from 'vue'
import { useDiffStore } from '../stores/diffStore'

const diff = useDiffStore()
const keys = ref([])
const editingFp = ref(null)
const editLabel = ref('')

async function refresh() {
  keys.value = await window.api.listTrustedKeys()
}
onMounted(refresh)

// After the "name this key" dialog closes (add flow), the list may have
// changed — re-fetch.
watch(
  () => diff.pendingTrustedKey,
  (v) => {
    if (!v) refresh()
  }
)

function startRename(k) {
  editingFp.value = k.fingerprint
  editLabel.value = k.label
}
async function commitRename() {
  const fp = editingFp.value
  editingFp.value = null
  if (fp && editLabel.value.trim()) {
    await window.api.renameTrusted(fp, editLabel.value)
    await refresh()
  }
}
async function remove(k) {
  await window.api.removeTrusted(k.fingerprint)
  await refresh()
}
function addKey() {
  // Opens the OS file picker, then the naming dialog on top of this one.
  diff.addTrustedKey()
}
function close() {
  diff.showTrustedKeysDialog = false
}
</script>

<template>
  <div class="backdrop">
    <div class="dialog">
      <div class="dialog-header">
        <h3>Trusted keys</h3>
        <button type="button" class="close-x" aria-label="Close" @click="close">×</button>
      </div>
      <p class="note">
        Public keys of people you can share sealed diffs with. Name each host so you recognize it in
        the recipient list.
      </p>

      <p v-if="!keys.length" class="empty">
        No trusted keys yet. Add someone's <code>.diffbrokey</code> (or drop it onto the window).
      </p>

      <ul v-else class="keys">
        <li v-for="k in keys" :key="k.fingerprint" class="key">
          <div class="key-body">
            <input
              v-if="editingFp === k.fingerprint"
              v-model="editLabel"
              class="rename"
              type="text"
              spellcheck="false"
              autofocus
              @keyup.enter="commitRename"
              @keyup.escape="editingFp = null"
              @blur="commitRename"
            />
            <span v-else class="label">{{ k.label }}</span>
            <span class="fp">{{ k.fingerprint }}</span>
          </div>
          <button class="icon" title="Rename" @click="startRename(k)">✎</button>
          <button class="icon delete" title="Remove" @click="remove(k)">×</button>
        </li>
      </ul>

      <div class="actions">
        <button class="primary" @click="addKey">Add key…</button>
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
  z-index: 30;
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
  gap: 10px;
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
  margin: 0;
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.5;
}
.empty {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-dim);
}
code {
  font-size: 11px;
}
.keys {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.key {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
}
.key:last-child {
  border-bottom: none;
}
.key-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.label {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fp {
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 10.5px;
  color: var(--text-hint);
}
.rename {
  background: var(--bg);
  border: 1px solid var(--accent);
  border-radius: 5px;
  color: var(--text);
  padding: 3px 6px;
  font-size: 13px;
}
.rename:focus {
  outline: none;
}
.icon {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
}
.icon:hover {
  color: var(--text);
}
.icon.delete:hover {
  color: #f85149;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
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
.ghost {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  padding: 6px 12px;
  cursor: pointer;
}
</style>
