<script setup>
import { ref, onMounted } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useVaultStore, DEFAULT_TTL_HOURS, TTL_OPTIONS } from '../stores/vaultStore'
import { useSnippetStore } from '../stores/snippetStore'
import BaseDialog from './BaseDialog.vue'
import TagChipsField from './TagChipsField.vue'

const diff = useDiffStore()
const vault = useVaultStore()
const snippets = useSnippetStore()

const name = ref('')
// Secure = auto-expiring (the app's default). Off keeps the diff indefinitely.
const secure = ref(true)
const ttl = ref(DEFAULT_TTL_HOURS)
const nameInput = ref(null)
const tagField = ref(null)

onMounted(() => {
  name.value =
    diff.mode === 'paste'
      ? `Pasted text (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
      : `${diff.left?.name ?? '?'} ↔ ${diff.right?.name ?? '?'}`
  nameInput.value?.focus()
  nameInput.value?.select()
})

async function save() {
  // Saving from paste mode should also run the comparison, so the user lands on
  // the diff they just kept instead of staying on the two input boxes.
  const wasPaste = diff.mode === 'paste'
  // User tags (the diff's detected format is auto-added in the store). Persist
  // any new tags' chosen colors into the shared registry so the chip color the
  // user saw sticks.
  const userTags = tagField.value ? [...tagField.value.tags] : []
  if (userTags.length) snippets.registerTags(userTags, tagField.value.newColors())
  const id = await vault.save(
    name.value.trim(),
    secure.value ? ttl.value : null,
    diff.snapshot(),
    userTags
  )
  diff.showSaveDialog = false
  // null id means the vault key couldn't be unlocked — nothing was saved.
  if (!id) {
    diff.saveThenShare = false
    diff.replaceAfterSave = null
    diff.pickAfterSave = null
    diff.showNotice(
      'Couldn’t save: the saved-diff key couldn’t be unlocked (the OS keychain may be locked). Try again once it’s available.'
    )
    return
  }
  // The on-screen comparison now matches a vault entry, so overwriting it no
  // longer needs the "you'll lose it" prompt.
  diff.markSaved()
  if (diff.saveThenShare) {
    // "Share" flow: continue straight into the recipient picker.
    diff.saveThenShare = false
    diff.shareEntryId = id
  } else if (diff.replaceAfterSave) {
    // "Save first" from the replace prompt: saved, now load the dropped file(s).
    diff.showNotice('Saved (encrypted). Loading the dropped file…')
    await diff.finishReplaceAfterSave()
  } else if (diff.pickAfterSave) {
    // "Save first" from the file-load prompt: saved, now open the picked file.
    diff.showNotice('Saved (encrypted). Loading the file…')
    diff.finishPickAfterSave()
  } else {
    // Initiate the comparison for a paste-mode save (comparePasted clears the
    // saved flag, so re-mark it — nothing has changed since the save).
    if (wasPaste) {
      diff.comparePasted()
      diff.markSaved()
    }
    diff.showNotice(
      secure.value
        ? `Saved (encrypted) — expires in ${ttl.value} h.`
        : 'Saved (encrypted) — kept until you delete it.'
    )
  }
}

function cancel() {
  diff.showSaveDialog = false
  diff.saveThenShare = false
  // Cancelling the save abandons a pending "save-then-replace/pick" too.
  diff.replaceAfterSave = null
  diff.pickAfterSave = null
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
      <TagChipsField ref="tagField" />
      <label class="toggle">
        <input v-model="secure" type="checkbox" />
        <span><strong>Secure</strong> — auto-expiring (deletes itself)</span>
      </label>
      <label v-if="secure">
        Expires after
        <select v-model.number="ttl">
          <option v-for="opt in TTL_OPTIONS" :key="opt.hours" :value="opt.hours">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <p class="dialog-note">
        {{
          secure
            ? 'Stored encrypted on this machine only and deleted automatically — 24 hours is the maximum.'
            : 'Stored encrypted on this machine only and kept until you delete it — no expiry.'
        }}
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
