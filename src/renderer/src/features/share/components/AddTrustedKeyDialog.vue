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
  <BaseDialog
    width="360px"
    :title="$t('share.addTrustedKeyDialog.addTrustedKey')"
    @close="share.cancelTrustedKey()"
  >
    <form class="dialog-form" @submit.prevent="add">
      <i18n-t keypath="share.addTrustedKeyDialog.intro" tag="p" class="dialog-note">
        <template #whose>
          <strong>{{ $t('share.addTrustedKeyDialog.someoneElses') }}</strong>
        </template>
        <template #fp
          ><code>{{ share.pendingTrustedKey?.fingerprint }}</code></template
        >
      </i18n-t>
      <i18n-t
        v-if="share.pendingTrustedKey?.vouchedBy"
        keypath="share.addTrustedKeyDialog.vouch"
        tag="p"
        class="dialog-note vouch"
      >
        <template #who
          ><strong>{{ share.pendingTrustedKey.vouchedBy }}</strong></template
        >
      </i18n-t>
      <label>
        {{ $t('share.addTrustedKeyDialog.name') }}
        <input
          v-model="label"
          type="text"
          spellcheck="false"
          :placeholder="$t('share.addTrustedKeyDialog.eGAliceLaptop')"
          autofocus
        />
      </label>
      <div class="dialog-actions">
        <button type="submit" class="btn btn-primary" :disabled="!label.trim() || adding">
          {{ adding ? $t('addTrustedKeyDialog.adding') : $t('addTrustedKeyDialog.add') }}
        </button>
        <button type="button" class="btn btn-ghost" @click="share.cancelTrustedKey()">
          {{ $t('common.cancel') }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped src="./styles/AddTrustedKeyDialog.css"></style>
