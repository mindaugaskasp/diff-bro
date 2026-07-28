<script setup>
import { onMounted, ref, watch } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import BaseDialog from './BaseDialog.vue'
import AppIcon from './AppIcon.vue'

const diff = useDiffStore()
const keys = ref([])
const editingFp = ref(null)
const editLabel = ref('')

async function refresh() {
  keys.value = await window.api.listTrustedKeys()
}
onMounted(refresh)

// Re-fetch after the "name this key" or "remove key?" dialog closes.
watch([() => diff.pendingTrustedKey, () => diff.pendingUntrust], ([a, b]) => {
  if (!a && !b) refresh()
})

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
function addKey() {
  // Opens the OS file picker, then the naming dialog on top of this one.
  diff.addTrustedKey()
}
function close() {
  // Drop the "just added" highlight so re-opening the manager later starts clean.
  diff.lastAddedTrustedFp = null
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

    <template v-else>
      <div class="keys-head">
        <span class="col-name">Host</span>
        <span class="count">{{ keys.length }} {{ keys.length === 1 ? 'key' : 'keys' }}</span>
      </div>
      <ul class="keys">
        <li
          v-for="k in keys"
          :key="k.fingerprint"
          class="key"
          :class="{ added: diff.lastAddedTrustedFp === k.fingerprint }"
        >
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
          <span v-if="diff.lastAddedTrustedFp === k.fingerprint" class="added-badge">Added</span>
          <button class="icon" title="Rename" @click="startRename(k)">
            <AppIcon name="edit" />
          </button>
          <button class="icon delete" title="Remove" @click="diff.pendingUntrust = k">
            <AppIcon name="x" />
          </button>
        </li>
      </ul>
    </template>

    <template #actions>
      <button class="btn btn-primary" @click="addKey">Add key…</button>
      <button class="btn btn-ghost" @click="close">Close</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/TrustedKeysDialog.css"></style>
