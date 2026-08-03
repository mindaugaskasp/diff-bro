<script setup>
import { computed, ref, onMounted } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { TTL_OPTIONS } from '../stores/vaultStore'
import { useSnippetStore } from '../stores/snippetStore'
import { useTabsStore } from '../stores/tabsStore'
import { useSaveDiffTarget } from '../composables/useSaveDiffTarget'
import BaseDialog from './BaseDialog.vue'
import TagChipsField from './TagChipsField.vue'
import { useShareStore } from '../features/share'

const diff = useDiffStore()
const share = useShareStore()
const snippets = useSnippetStore()
const tabs = useTabsStore()
// A comparison already in the vault is rewritten, not saved a second time.
const { isUpdate, initial, commit } = useSaveDiffTarget()

const name = ref('')
// Secure = auto-expiring (the app's default). Off keeps the diff indefinitely.
const secure = ref(true)
const ttl = ref(1)
const startTags = ref([])
const nameInput = ref(null)
const tagField = ref(null)

onMounted(() => {
  const start = initial()
  name.value = start.name
  secure.value = start.secure
  ttl.value = start.ttl
  startTags.value = start.tags
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
  if (share.saveThenShare) {
    share.saveThenShare = false
    diff.showSaveDialog = false
    share.beginShareDraft({
      name: name.value.trim(),
      ttlHours: secure.value ? ttl.value : null,
      snapshot: diff.snapshot(),
      tags: userTags
    })
    return
  }

  const id = await commit({
    name: name.value.trim(),
    ttlHours: secure.value ? ttl.value : null,
    snapshot: diff.snapshot(),
    tags: userTags
  })
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

// An update rewrites the diff this tab already is; a save makes a new one.
const dialogTitle = computed(() => {
  if (share.saveThenShare) return 'Share diff — step 1 of 2: save it'
  return isUpdate.value ? 'Update diff' : 'Save diff'
})
const submitLabel = computed(() => {
  if (share.saveThenShare) return 'Next: choose recipient'
  return isUpdate.value ? 'Update' : 'Save'
})

function cancel() {
  diff.showSaveDialog = false
  share.saveThenShare = false
  // Cancelling the save abandons a pending "save-then-replace/pick" too.
  diff.replaceAfterSave = null
  diff.pickAfterSave = null
}
</script>

<template>
  <BaseDialog width="340px" :title="dialogTitle" @close="cancel">
    <form class="dialog-form" @submit.prevent="save">
      <label>
        Name
        <input ref="nameInput" v-model="name" type="text" spellcheck="false" />
      </label>
      <TagChipsField ref="tagField" :initial="startTags" />
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
            ? 'Deletes itself automatically — a week is the longest it can live.'
            : 'Kept until you delete it.'
        }}
      </p>
      <div class="dialog-actions">
        <button type="submit" class="btn btn-primary">
          {{ submitLabel }}
        </button>
        <button type="button" class="btn btn-ghost" @click="cancel">Cancel</button>
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped src="./styles/SaveDiffDialog.css"></style>
