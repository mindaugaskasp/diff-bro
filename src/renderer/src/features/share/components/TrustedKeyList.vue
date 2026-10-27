<script setup>
// Shared by the Keys panel and the manager the share dialog opens over itself.
import { computed, onMounted, ref, watch } from 'vue'
import { useShareStore } from '../shareStore'
import { filterRecipients } from '../../../utils/recipientSearch'
import AppIcon from '../../../components/AppIcon.vue'
import TrustedKeyRow from './TrustedKeyRow.vue'

const props = defineProps({ query: { type: String, default: '' } })
const emit = defineEmits(['editing'])
const share = useShareStore()
const ownQuery = ref('')
const q = computed(() => props.query || ownQuery.value)
const shown = computed(() => filterRecipients(share.trusted, { query: q.value }))

onMounted(() => share.refreshTrusted())
// Re-read once a "name this key" or "remove key?" dialog has closed.
watch([() => share.pendingTrustedKey, () => share.pendingUntrust], ([a, b]) => {
  if (!a && !b) share.refreshTrusted()
})

async function commitRename(fingerprint, label) {
  const res = await window.api.renameTrusted(fingerprint, label)
  if (res?.error) share.noticeKeyName(res.error)
  await share.refreshTrusted()
}
async function commitEmail(fingerprint, email) {
  const res = await window.api.setTrustedEmail(fingerprint, email)
  if (res?.error === 'bad-email') share.noticeBadEmail()
  await share.refreshTrusted()
}
</script>

<template>
  <div class="trusted-list">
    <div v-if="!query && share.trusted.length > 5" class="keys-head">
      <span class="field-search">
        <AppIcon name="search" />
        <input
          v-model="ownQuery"
          type="search"
          :placeholder="$t('trustedKeysDialog.searchKeys', { count: share.trusted.length })"
          spellcheck="false"
          :aria-label="$t('share.trustedKeysDialog.searchTrustedKeys')"
        />
        <button
          v-if="ownQuery"
          type="button"
          :aria-label="$t('share.trustedKeysDialog.clearSearch')"
          @click="ownQuery = ''"
        >
          <AppIcon name="x" />
        </button>
      </span>
    </div>
    <p v-if="!shown.length && q" class="empty">
      {{ $t('share.trustedKeysDialog.noKeyMatches', { q }) }}
    </p>
    <ul v-else class="keys">
      <TrustedKeyRow
        v-for="k in shown"
        :key="k.fingerprint"
        :entry="k"
        :just-added="share.lastAddedTrustedFp === k.fingerprint"
        @editing="emit('editing', $event)"
        @rename="commitRename(k.fingerprint, $event)"
        @email="commitEmail(k.fingerprint, $event)"
        @remove="share.pendingUntrust = k"
      />
    </ul>
  </div>
</template>

<style scoped src="./styles/TrustedKeysDialog.css"></style>
