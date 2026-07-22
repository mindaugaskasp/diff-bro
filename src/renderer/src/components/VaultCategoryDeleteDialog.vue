<script setup>
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import BaseDialog from './BaseDialog.vue'

const vault = useVaultStore()
const pending = computed(() => vault.pendingDelete)
const isCategory = computed(() => pending.value?.type === 'category')
</script>

<template>
  <BaseDialog
    v-if="pending"
    width="320px"
    :title="isCategory ? 'Delete category?' : 'Delete saved diff?'"
    :closable="false"
    @close="vault.cancelDelete()"
  >
    <p class="dialog-note">
      Delete <strong>“{{ pending.name }}”</strong>?
      <template v-if="isCategory">
        Saved diffs already expire on their own; the category itself is removed now.
      </template>
      This can’t be undone.
    </p>
    <template #actions>
      <button class="btn btn-destructive" @click="vault.confirmDelete()">Delete</button>
      <button class="btn btn-ghost" @click="vault.cancelDelete()">Cancel</button>
    </template>
  </BaseDialog>
</template>
<style scoped src="./styles/VaultCategoryDeleteDialog.css"></style>
