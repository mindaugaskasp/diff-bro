<script setup>
import { ref, onMounted } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useVaultStore, DEFAULT_TTL_HOURS, TTL_OPTIONS } from '../stores/vaultStore'
import BaseDialog from './BaseDialog.vue'

const diff = useDiffStore()
const vault = useVaultStore()

const name = ref('')
const ttl = ref(DEFAULT_TTL_HOURS)
const nameInput = ref(null)
// '__new__' reveals an input to create a category on the fly.
const NEW_CATEGORY = '__new__'
const categoryId = ref(vault.defaultCategoryId)
const newCategoryName = ref('')

onMounted(() => {
  name.value =
    diff.mode === 'paste'
      ? `Pasted text (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
      : `${diff.left?.name ?? '?'} ↔ ${diff.right?.name ?? '?'}`
  nameInput.value?.focus()
  nameInput.value?.select()
})

async function save() {
  let targetCategory = categoryId.value
  if (targetCategory === NEW_CATEGORY) {
    targetCategory = newCategoryName.value.trim()
      ? vault.addCategory(newCategoryName.value)
      : vault.defaultCategoryId
  }
  const id = await vault.save(name.value.trim(), ttl.value, diff.snapshot(), targetCategory)
  diff.showSaveDialog = false
  // null id means the vault key couldn't be unlocked — nothing was saved.
  if (!id) {
    diff.saveThenShare = false
    diff.replaceAfterSave = null
    diff.showNotice(
      'Couldn’t save: the saved-diff key couldn’t be unlocked (the OS keychain may be locked). Try again once it’s available.'
    )
    return
  }
  if (diff.saveThenShare) {
    // "Share" flow: continue straight into the recipient picker.
    diff.saveThenShare = false
    diff.shareEntryId = id
  } else if (diff.replaceAfterSave) {
    // "Save first" from the replace prompt: saved, now load the dropped file(s).
    diff.showNotice('Saved (encrypted). Loading the dropped file…')
    await diff.finishReplaceAfterSave()
  } else {
    diff.showNotice(`Saved (encrypted) — expires in ${ttl.value} h.`)
  }
}

function cancel() {
  diff.showSaveDialog = false
  diff.saveThenShare = false
  // Cancelling the save abandons a pending "save-then-replace" too.
  diff.replaceAfterSave = null
}
</script>

<template>
  <BaseDialog
    width="340px"
    :title="diff.saveThenShare ? 'Share diff — step 1 of 2: save it' : 'Save diff'"
    @close="cancel"
  >
    <form class="dialog-form" @submit.prevent="save">
      <label>
        Name
        <input ref="nameInput" v-model="name" type="text" spellcheck="false" />
      </label>
      <label>
        Category
        <select v-model="categoryId">
          <option v-for="c in vault.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          <option :value="NEW_CATEGORY">+ New category…</option>
        </select>
      </label>
      <label v-if="categoryId === NEW_CATEGORY">
        New category name
        <input
          v-model="newCategoryName"
          type="text"
          spellcheck="false"
          placeholder="Category name…"
        />
      </label>
      <label>
        Expires after
        <select v-model.number="ttl">
          <option v-for="opt in TTL_OPTIONS" :key="opt.hours" :value="opt.hours">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <p class="dialog-note">
        Stored encrypted on this machine only and deleted automatically — 24 hours is the maximum.
      </p>
      <div class="dialog-actions">
        <button type="submit" class="btn btn-primary">
          {{ diff.saveThenShare ? 'Next: choose recipient' : 'Save' }}
        </button>
        <button type="button" class="btn btn-ghost" @click="cancel">Cancel</button>
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped src="./styles/SaveDiffDialog.css"></style>
