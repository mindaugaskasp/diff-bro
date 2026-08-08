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
const emit = defineEmits(['rename', 'email', 'remove', 'editing'])

const editing = ref(null)
const draft = ref('')

function start(field) {
  editing.value = field
  draft.value = (field === 'label' ? props.entry.label : props.entry.email) ?? ''
  emit('editing', true)
}
function commit() {
  const field = editing.value
  if (!field) return
  editing.value = null
  emit('editing', false)
  emit(field === 'label' ? 'rename' : 'email', draft.value.trim())
}
function cancel() {
  editing.value = null
  emit('editing', false)
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
        :aria-label="$t('share.trustedKeyRow.nameForThisKey')"
        @keyup.enter="commit"
        @keyup.escape="cancel"
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
        :placeholder="$t('share.trustedKeyRow.nameExampleCom')"
        :aria-label="$t('share.trustedKeyRow.emailAddressForThisKey')"
        @keyup.enter="commit"
        @keyup.escape="cancel"
        @blur="commit"
      />
      <button
        v-else
        type="button"
        class="mail"
        :class="{ set: !!entry.email }"
        @click="start('email')"
      >
        <AppIcon name="mail" />
        <span>{{ entry.email || $t('trustedKeyRow.addEmail') }}</span>
      </button>
    </div>

    <span v-if="justAdded" class="added-badge">{{ $t('share.trustedKeyRow.added') }}</span>
    <button
      class="icon"
      :data-tip="$t('share.trustedKeyRow.renameThisKey')"
      :aria-label="$t('share.trustedKeyRow.rename')"
      @click="start('label')"
    >
      <AppIcon name="edit" />
    </button>
    <button
      class="icon delete"
      :data-tip="$t('share.trustedKeyRow.stopTrustingThisKey')"
      :aria-label="$t('common.remove')"
      @click="emit('remove')"
    >
      <AppIcon name="x" />
    </button>
  </li>
</template>

<style scoped src="./styles/TrustedKeyRow.css"></style>
