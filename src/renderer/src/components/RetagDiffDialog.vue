<script setup>
// Retag a saved diff. Tags are plaintext metadata beside the ciphertext, so this
// rewrites them in place — the snapshot is never decrypted or re-encrypted.
import { computed, ref } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import BaseDialog from './BaseDialog.vue'
import TagChipsField from './TagChipsField.vue'

const vault = useVaultStore()
const pending = computed(() => vault.pendingRetag)
const tagField = ref(null)

function save() {
  const field = tagField.value
  if (!field) return
  vault.setTags(pending.value.id, [...field.tags], field.newColors())
  vault.cancelRetag()
}
</script>

<template>
  <BaseDialog
    v-if="pending"
    width="340px"
    title="Edit tags"
    :escape-closes="false"
    @close="vault.cancelRetag()"
  >
    <form class="dialog-form" @submit.prevent="save">
      <p class="dialog-note">
        Tags for <strong>“{{ pending.name }}”</strong>.
      </p>
      <TagChipsField ref="tagField" :initial="pending.tags" />
    </form>
    <template #actions>
      <button class="btn btn-primary" @click="save">Save tags</button>
      <button class="btn btn-ghost" @click="vault.cancelRetag()">Cancel</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/RetagDiffDialog.css"></style>
