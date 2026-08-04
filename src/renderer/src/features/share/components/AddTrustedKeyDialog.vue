<script setup>
import { ref } from 'vue'
import { useShareStore } from '../shareStore'
import BaseDialog from '../../../components/BaseDialog.vue'

const share = useShareStore()
const label = ref(share.pendingTrustedKey?.label ?? '')
// Guard against a second submit while the key is still being stored.
const adding = ref(false)

async function add() {
  if (adding.value) return
  adding.value = true
  await share.confirmTrustedKey(label.value)
}
</script>

<template>
  <BaseDialog width="360px" title="Add trusted key" @close="share.cancelTrustedKey()">
    <form class="dialog-form" @submit.prevent="add">
      <p class="dialog-note">
        Adding <strong>someone else's</strong> public key so you can receive diffs they share. The
        name is prefilled from what they called their key — keep it or rename it. Fingerprint
        <code>{{ share.pendingTrustedKey?.fingerprint }}</code
        >.
      </p>
      <p v-if="share.pendingTrustedKey?.vouchedBy" class="dialog-note vouch">
        This key says it replaces <strong>{{ share.pendingTrustedKey.vouchedBy }}</strong
        >, and that key signed the claim. Check the fingerprint with them anyway — anyone holding
        their old key could have signed it.
      </p>
      <label>
        Name
        <input
          v-model="label"
          type="text"
          spellcheck="false"
          placeholder="e.g. Alice — laptop"
          autofocus
        />
      </label>
      <div class="dialog-actions">
        <button type="submit" class="btn btn-primary" :disabled="!label.trim() || adding">
          {{ adding ? 'Adding…' : 'Add' }}
        </button>
        <button type="button" class="btn btn-ghost" @click="share.cancelTrustedKey()">
          Cancel
        </button>
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped src="./styles/AddTrustedKeyDialog.css"></style>
