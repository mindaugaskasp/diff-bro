<script setup>
import { onMounted, ref, watch } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import BaseDialog from './BaseDialog.vue'

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
  <BaseDialog width="460px" title="Trusted keys" @close="close">
    <p class="dialog-note">
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

    <template #actions>
      <button class="btn btn-primary" @click="addKey">Add key…</button>
      <button class="btn btn-ghost" @click="close">Close</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/TrustedKeysDialog.css"></style>
