<script setup>
import { ref, onMounted } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useVaultStore, DEFAULT_TTL_HOURS, TTL_OPTIONS } from '../stores/vaultStore'
import { useSnippetStore } from '../stores/snippetStore'
import { useTabsStore } from '../stores/tabsStore'
import BaseDialog from './BaseDialog.vue'
import TagChipsField from './TagChipsField.vue'

const diff = useDiffStore()
const vault = useVaultStore()
const snippets = useSnippetStore()
const tabs = useTabsStore()

const name = ref('')
// Secure = auto-expiring (the app's default). Off keeps the diff indefinitely.
const secure = ref(true)
const ttl = ref(DEFAULT_TTL_HOURS)
const nameInput = ref(null)
const tagField = ref(null)

onMounted(() => {
  // A tab the reader renamed has already been given the name for this
  // comparison; asking for it again would be asking twice.
  name.value =
    tabs.active?.customTitle ||
    (diff.mode === 'paste'
      ? `Pasted text (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
      : `${diff.left?.name ?? '?'} ↔ ${diff.right?.name ?? '?'}`)
  nameInput.value?.focus()
  nameInput.value?.select()
})

async function save() {
  // Saving from paste mode also runs the comparison, so the user lands on the diff.
  const wasPaste = diff.mode === 'paste'
  // Persist any new tags' colors so the chip color the user saw sticks.
  const userTags = tagField.value ? [...tagField.value.tags] : []
  if (userTags.length) snippets.registerTags(userTags, tagField.value.newColors())

  // "Share" flow: don't persist yet — capture the draft and go to the recipient
  // picker. The local copy + sealed file are written together only when the share
  // completes (diffStore.shareTo), so cancelling anywhere leaves nothing behind.
  if (diff.saveThenShare) {
    diff.saveThenShare = false
    diff.showSaveDialog = false
    diff.beginShareDraft({
      name: name.value.trim(),
      ttlHours: secure.value ? ttl.value : null,
      snapshot: diff.snapshot(),
      tags: userTags
    })
    return
  }

  const id = await vault.save(
    name.value.trim(),
    secure.value ? ttl.value : null,
    diff.snapshot(),
    userTags
  )
  diff.showSaveDialog = false
  // null id means the vault key couldn't be unlocked — nothing was saved.
  if (!id) {
    diff.replaceAfterSave = null
    diff.pickAfterSave = null
    diff.showNotice(
      'Couldn’t save: the saved-diff key couldn’t be unlocked (the OS keychain may be locked). Try again once it’s available.'
    )
    return
  }
  // The tab and the entry are now the same comparison, so the tab takes the
  // name that was just saved and links to it.
  if (tabs.active) {
    tabs.active.entryId = id
    tabs.rename(tabs.activeId, name.value.trim())
  }
  await diff.finishSave(wasPaste, secure.value ? ttl.value : null)
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
            ? 'Deletes itself automatically — 24 hours is the maximum.'
            : 'Kept until you delete it.'
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
