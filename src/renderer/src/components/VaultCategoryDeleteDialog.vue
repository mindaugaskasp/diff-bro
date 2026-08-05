<script setup>
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import BaseDialog from './BaseDialog.vue'

const vault = useVaultStore()
const pending = computed(() => vault.pendingDelete)
</script>

<template>
  <BaseDialog
    v-if="pending"
    width="320px"
    :title="$t('vaultCategoryDeleteDialog.deleteSavedDiff')"
    :closable="false"
    @close="vault.cancelDelete()"
  >
    <p class="dialog-note">
      {{ $t('vaultCategoryDeleteDialog.delete') }} <strong>“{{ pending.name }}”</strong>? This can’t
      be undone.
    </p>
    <template #actions>
      <button class="btn btn-destructive" @click="vault.confirmDelete()">
        {{ $t('vaultCategoryDeleteDialog.delete') }}
      </button>
      <button class="btn btn-ghost" @click="vault.cancelDelete()">
        {{ $t('common.cancel') }}
      </button>
    </template>
  </BaseDialog>
</template>
<style scoped src="./styles/VaultCategoryDeleteDialog.css"></style>
