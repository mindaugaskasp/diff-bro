<script setup>
import { computed, ref, watch } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import BaseDialog from './BaseDialog.vue'

const store = useSnippetStore()
const pending = computed(() => store.pendingDelete)
const isTag = computed(() => pending.value?.type === 'tag')
const label = computed(() => (isTag.value ? 'tag' : 'snippet'))

// Counted before anything goes, so the sentence is about what WILL happen.
const held = computed(() => (isTag.value ? store.taggedCount(pending.value.id) : null))
const total = computed(() => (held.value?.snippets ?? 0) + (held.value?.diffs ?? 0))
const carrying = computed(() => {
  const parts = []
  const { snippets, diffs } = held.value ?? {}
  if (snippets) parts.push(`${snippets} snippet${snippets === 1 ? '' : 's'}`)
  if (diffs) parts.push(`${diffs} saved diff${diffs === 1 ? '' : 's'}`)
  return parts.join(' and ')
})

// Off every time the dialog opens: deleting the records is the bigger action,
// and it must never be inherited from the last tag someone removed.
const withEntries = ref(false)
watch(pending, () => (withEntries.value = false))

const destructive = computed(() => !isTag.value || (withEntries.value && total.value > 0))
</script>

<template>
  <BaseDialog
    v-if="pending"
    width="380px"
    :title="`Delete ${label}?`"
    :closable="false"
    @close="store.cancelDelete()"
  >
    <p class="dialog-note">
      Delete the {{ label }} <strong>“{{ pending.name }}”</strong>?
      <template v-if="isTag && total">
        It’s on {{ carrying }}.
        <template v-if="!withEntries">{{ $t('snippetDeleteDialog.theyKeepTheRestOf') }}</template>
      </template>
      <template v-else-if="isTag">{{ $t('snippetDeleteDialog.nothingIsUsingIt') }}</template>
      <template v-else> {{ $t('snippetDeleteDialog.thisCanTBeUndone') }} </template>
    </p>

    <label v-if="isTag && total" class="also">
      <input v-model="withEntries" type="checkbox" />
      <span>Delete the {{ carrying }} too</span>
    </label>
    <p v-if="withEntries && total" class="dialog-note warn">
      {{ $t('snippetDeleteDialog.thatCanTBeUndone') }}
    </p>

    <template #actions>
      <button class="btn btn-destructive" @click="store.confirmDelete({ withEntries })">
        {{ destructive && isTag && withEntries ? `Delete tag and ${total}` : 'Delete' }}
      </button>
      <button class="btn btn-ghost" @click="store.cancelDelete()">
        {{ $t('common.cancel') }}
      </button>
    </template>
  </BaseDialog>
</template>
<style scoped src="./styles/SnippetDeleteDialog.css"></style>
