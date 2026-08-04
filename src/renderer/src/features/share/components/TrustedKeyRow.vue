<script setup>
// One trusted key: label, fingerprint, and the email address used to reach its
// owner. Split out of TrustedKeysDialog because the row grew a third line and
// two in-place editors — the dialog was past its template cap.
import { ref } from 'vue'
import AppIcon from '../../../components/AppIcon.vue'
import { shaped } from '../../../utils/props'

const props = defineProps({
  /** @type {import('vue').PropType<import('../../../types').TrustedKey>} */
  entry: { type: Object, required: true, validator: shaped('fingerprint', 'label') },
  justAdded: { type: Boolean, default: false }
})
const emit = defineEmits(['rename', 'email', 'remove'])

const editing = ref(null)
const draft = ref('')

function start(field) {
  editing.value = field
  draft.value = (field === 'label' ? props.entry.label : props.entry.email) ?? ''
}
function commit() {
  const field = editing.value
  if (!field) return
  editing.value = null
  emit(field === 'label' ? 'rename' : 'email', draft.value.trim())
}
</script>

<template>
  <li class="key" :class="{ added: justAdded }">
    <div class="key-body">
      <input
        v-if="editing === 'label'"
        v-model="draft"
        class="inline-edit"
        type="text"
        spellcheck="false"
        autofocus
        aria-label="Name for this key"
        @keyup.enter="commit"
        @keyup.escape="editing = null"
        @blur="commit"
      />
      <button v-else type="button" class="label" @click="start('label')">
        {{ entry.label }}
      </button>

      <span class="fp">{{ entry.fingerprint }}</span>

      <input
        v-if="editing === 'email'"
        v-model="draft"
        class="inline-edit"
        type="text"
        inputmode="email"
        spellcheck="false"
        autofocus
        placeholder="name@example.com"
        aria-label="Email address for this key"
        @keyup.enter="commit"
        @keyup.escape="editing = null"
        @blur="commit"
      />
      <button v-else type="button" class="mail" :class="{ set: !!entry.email }" @click="start('email')">
        <AppIcon name="mail" />
        <span>{{ entry.email || 'Add email' }}</span>
      </button>
    </div>

    <span v-if="justAdded" class="added-badge">Added</span>
    <button class="icon" data-tip="Rename this key" aria-label="Rename" @click="start('label')">
      <AppIcon name="edit" />
    </button>
    <button
      class="icon delete"
      data-tip="Stop trusting this key"
      aria-label="Remove"
      @click="emit('remove')"
    >
      <AppIcon name="x" />
    </button>
  </li>
</template>

<style scoped src="./styles/TrustedKeyRow.css"></style>
