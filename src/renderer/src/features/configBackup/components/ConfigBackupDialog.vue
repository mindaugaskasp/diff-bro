<script setup>
import { computed, ref } from 'vue'
import { useDiffStore } from '../../../stores/diffStore'
import { useConfigBackupStore } from '../configBackupStore'
import { PASSPHRASE_HINT, passphraseTooShort } from '../../../passphrase'
import BaseDialog from '../../../components/BaseDialog.vue'

const diff = useDiffStore()
const backup = useConfigBackupStore()
const passphrase = ref('')
const busy = ref(false)
const isBackup = computed(() => backup.mode === 'backup')
const destination = computed(() => backup.pendingPath)

async function submit() {
  if (!passphrase.value || busy.value) return
  // A backup creates the file, so require a minimum-length passphrase; a
  // restore must accept whatever the backup was made with.
  if (isBackup.value && passphraseTooShort(passphrase.value)) {
    diff.showNotice(PASSPHRASE_HINT)
    return
  }
  busy.value = true
  try {
    if (!isBackup.value) await backup.restore(passphrase.value)
    else if (destination.value) await backup.runTo(destination.value, passphrase.value)
    else await backup.run(passphrase.value)
    close()
  } finally {
    busy.value = false
  }
}

function close() {
  backup.close()
  passphrase.value = ''
}
</script>

<template>
  <BaseDialog
    width="380px"
    :title="isBackup ? 'Back up configuration' : 'Restore configuration'"
    @close="close"
  >
    <form class="dialog-form" @submit.prevent="submit">
      <p class="dialog-note">
        <template v-if="isBackup">
          {{ $t('configBackup.dialog.encryptsYourIdentityKeysTrusted') }}
        </template>
        <template v-else>
          {{ $t('configBackup.dialog.restoresIdentityKeysTrustedHosts') }}
        </template>
      </p>
      <p v-if="destination" class="dialog-note dest">Writing to {{ destination }}</p>
      <label>
        {{ $t('configBackup.dialog.passphrase') }}
        <input
          v-model="passphrase"
          type="password"
          autocomplete="off"
          spellcheck="false"
          autofocus
        />
      </label>
      <div class="dialog-actions">
        <button type="submit" class="btn btn-primary" :disabled="!passphrase || busy">
          {{ isBackup ? 'Back up' : 'Restore' }}
        </button>
        <button type="button" class="btn btn-ghost" @click="close">
          {{ $t('common.cancel') }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped src="./styles/ConfigBackupDialog.css"></style>
