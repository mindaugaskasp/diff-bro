<script setup>
import { computed } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import BaseDialog from './BaseDialog.vue'

const store = useSnippetStore()
const pending = computed(() => store.pendingDelete)
const isTag = computed(() => pending.value?.type === 'tag')
const label = computed(() => (isTag.value ? 'tag' : 'snippet'))
</script>

<template>
  <BaseDialog
    v-if="pending"
    width="320px"
    :title="`Delete ${label}?`"
    :closable="false"
    @close="store.cancelDelete()"
  >
    <p class="dialog-note">
      Delete the {{ label }} <strong>“{{ pending.name }}”</strong>?
      <template v-if="isTag">
        It's removed from every snippet, but no snippets are deleted.
      </template>
      <template v-else> This can’t be undone. </template>
    </p>
    <template #actions>
      <button class="btn btn-destructive" @click="store.confirmDelete()">Delete</button>
      <button class="btn btn-ghost" @click="store.cancelDelete()">Cancel</button>
    </template>
  </BaseDialog>
</template>
<style scoped src="./styles/SnippetDeleteDialog.css"></style>
