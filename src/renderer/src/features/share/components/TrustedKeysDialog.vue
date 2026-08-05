<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useShareStore } from '../shareStore'
import { filterRecipients } from '../../../utils/recipientSearch'
import BaseDialog from '../../../components/BaseDialog.vue'
import AppIcon from '../../../components/AppIcon.vue'
import TrustedKeyRow from './TrustedKeyRow.vue'

const share = useShareStore()
const keys = ref([])
const query = ref('')
const editingCount = ref(0)

const shown = computed(() => filterRecipients(keys.value, { query: query.value }))

async function refresh() {
  keys.value = await window.api.listTrustedKeys()
}
// BaseDialog stops Escape on WINDOW in capture, which killed the row's own
// cancel handler and closed the manager mid-edit — discarding the label or
// address being typed. This dialog owns Escape instead: cancel the edit first,
// close only when nothing is being edited.
function onEscape(e) {
  if (e.key !== 'Escape') return
  if (editingCount.value > 0) return // the row's own handler cancels it
  e.stopPropagation()
  close()
}

onMounted(() => {
  refresh()
  window.addEventListener('keydown', onEscape, true)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onEscape, true))

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
  <BaseDialog
    width="480px"
    :title="$t('share.trustedKeysDialog.trustedKeys')"
    :escape-closes="false"
    @close="close"
  >
    <p class="dialog-note">
      {{ $t('share.trustedKeysDialog.publicKeysOfPeopleYou') }}
    </p>

    <p v-if="!keys.length" class="empty">
      <i18n-t keypath="share.trustedKeysDialog.noKeysYet" tag="span">
        <template #ext><code>.diffbrokey</code></template>
      </i18n-t>
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
            :aria-label="$t('share.trustedKeysDialog.searchTrustedKeys')"
          />
          <button
            v-if="query"
            type="button"
            :aria-label="$t('share.trustedKeysDialog.clearSearch')"
            @click="query = ''"
          >
            <AppIcon name="x" />
          </button>
        </span>
        <span class="count">
          {{ shown.length === keys.length ? keys.length : `${shown.length} of ${keys.length}` }}
        </span>
      </div>

      <p v-if="!shown.length" class="empty">
        {{ $t('share.trustedKeysDialog.noKeyMatches', { q: query }) }}
      </p>
      <ul v-else class="dialog-scroller keys">
        <TrustedKeyRow
          v-for="k in shown"
          :key="k.fingerprint"
          :entry="k"
          :just-added="share.lastAddedTrustedFp === k.fingerprint"
          @editing="editingCount += $event ? 1 : -1"
          @rename="commitRename(k.fingerprint, $event)"
          @email="commitEmail(k.fingerprint, $event)"
          @remove="share.pendingUntrust = k"
        />
      </ul>
    </template>

    <template #actions>
      <button class="btn btn-primary" @click="share.addTrustedKey()">
        {{ $t('share.trustedKeysDialog.addKey') }}
      </button>
      <button class="btn btn-ghost" @click="close">{{ $t('common.close') }}</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/TrustedKeysDialog.css"></style>
