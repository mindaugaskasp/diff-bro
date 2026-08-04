<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useShareStore } from '../shareStore'
import { filterRecipients } from '../../../utils/recipientSearch'
import BaseDialog from '../../../components/BaseDialog.vue'
import AppIcon from '../../../components/AppIcon.vue'
import TrustedKeyRow from './TrustedKeyRow.vue'

const share = useShareStore()
const keys = ref([])
const query = ref('')

const shown = computed(() => filterRecipients(keys.value, { query: query.value }))

async function refresh() {
  keys.value = await window.api.listTrustedKeys()
}
onMounted(refresh)

// Re-fetch after the "name this key" or "remove key?" dialog closes.
watch([() => share.pendingTrustedKey, () => share.pendingUntrust], ([a, b]) => {
  if (!a && !b) refresh()
})

async function commitRename(fingerprint, label) {
  if (label.trim()) await window.api.renameTrusted(fingerprint, label)
  await refresh()
}

async function commitEmail(fingerprint, email) {
  const res = await window.api.setTrustedEmail(fingerprint, email)
  if (res?.error === 'bad-email') share.noticeBadEmail()
  await refresh()
}

function close() {
  // Drop the "just added" highlight so re-opening the manager later starts clean.
  share.lastAddedTrustedFp = null
  query.value = ''
  share.showTrustedKeysDialog = false
}
</script>

<template>
  <BaseDialog width="480px" title="Trusted keys" @close="close">
    <p class="dialog-note">
      Public keys of people you can share sealed diffs with. Give a key an email address to email
      its diffs from here.
    </p>

    <p v-if="!keys.length" class="empty">
      No trusted keys yet. Add someone's <code>.diffbrokey</code> (or drop it onto the window).
    </p>

    <template v-else>
      <div class="keys-head">
        <span class="field-search">
          <AppIcon name="search" />
          <input
            v-model="query"
            type="search"
            :placeholder="`Search ${keys.length} keys…`"
            spellcheck="false"
            aria-label="Search trusted keys"
          />
          <button v-if="query" type="button" aria-label="Clear search" @click="query = ''">
            <AppIcon name="x" />
          </button>
        </span>
        <span class="count">
          {{ shown.length === keys.length ? keys.length : `${shown.length} of ${keys.length}` }}
        </span>
      </div>

      <p v-if="!shown.length" class="empty">No key matches “{{ query }}”.</p>
      <ul v-else class="dialog-scroller keys">
        <TrustedKeyRow
          v-for="k in shown"
          :key="k.fingerprint"
          :entry="k"
          :just-added="share.lastAddedTrustedFp === k.fingerprint"
          @rename="commitRename(k.fingerprint, $event)"
          @email="commitEmail(k.fingerprint, $event)"
          @remove="share.pendingUntrust = k"
        />
      </ul>
    </template>

    <template #actions>
      <button class="btn btn-primary" @click="share.addTrustedKey()">Add key…</button>
      <button class="btn btn-ghost" @click="close">Close</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/TrustedKeysDialog.css"></style>
