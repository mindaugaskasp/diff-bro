<script setup>
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import BaseDialog from './BaseDialog.vue'

const vault = useVaultStore()
const pending = computed(() => vault.pendingDelete)
const isCategory = computed(() => pending.value?.type === 'category')
// A category delete now takes the diffs filed under it with it — warn only when
// there actually are any (an empty category loses nothing).
const catHasDiffs = computed(
  () => isCategory.value && vault.diffsInCategory(pending.value.id).length > 0
)
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
      <template v-if="isCategory">
        Delete category <strong>“{{ pending.name }}”</strong>?<template v-if="catHasDiffs">
          Saved diffs will also be deleted. This can’t be undone.</template
        >
      </template>
      <template v-else> Delete <strong>“{{ pending.name }}”</strong>? This can’t be undone. </template>
    </p>
    <template #actions>
      <button class="btn btn-destructive" @click="vault.confirmDelete()">Delete</button>
      <button class="btn btn-ghost" @click="vault.cancelDelete()">Cancel</button>
    </template>
  </BaseDialog>
</template>
<style scoped src="./styles/VaultCategoryDeleteDialog.css"></style>
