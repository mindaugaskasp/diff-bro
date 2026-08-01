<script setup>
// The launcher's new-snippet panel: it fills the preview pane while composing.
// Plaintext only, so there is no language picker and no Monaco here.
import { nextTick, ref } from 'vue'
import { useCaretBackOut } from '../composables/useCaretBackOut'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  editing: { type: Boolean, default: false },
  canSave: { type: Boolean, default: false },
  saving: { type: Boolean, default: false }
})
const name = defineModel('name', { type: String, required: true })
const body = defineModel('body', { type: String, required: true })
const emit = defineEmits(['save', 'cancel'])

const nameEl = ref(null)
const bodyEl = ref(null)

// Escape and ← back out, matching the list's ladder; ← defers to the caret.
const { onKeydown: backOut } = useCaretBackOut(() => emit('cancel'))

function onKeydown(e) {
  if (e.key === 'Escape') return emit('cancel')
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    if (props.canSave) emit('save')
    return
  }
  backOut(e)
}

// The body is what makes a snippet and the name is optional, so typing starts
// where the content goes; Shift+Tab reaches the name.
defineExpose({ focus: () => nextTick(() => bodyEl.value?.focus()) })
</script>

<template>
  <div class="ql-compose" @keydown="onKeydown">
    <div class="ql-compose-head band">
      <span class="ql-compose-title">{{ editing ? 'Edit snippet' : 'New snippet' }}</span>
      <span class="ql-compose-lang">plaintext</span>
    </div>

    <div class="ql-compose-body">
      <input
        ref="nameEl"
        v-model="name"
        class="ql-compose-name"
        type="text"
        placeholder="Name (optional)"
        autocomplete="off"
        spellcheck="false"
      />
      <textarea
        ref="bodyEl"
        v-model="body"
        class="ql-compose-text"
        placeholder="Paste or type the snippet…"
        spellcheck="false"
      ></textarea>
    </div>

    <div class="ql-compose-foot band">
      <span class="ql-compose-actions">
        <button class="btn btn-sm" @click="emit('cancel')">Cancel</button>
        <button class="btn btn-primary btn-sm" :disabled="!canSave" @click="emit('save')">
          <AppIcon name="check" /> {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </span>
    </div>
  </div>
</template>

<style scoped src="./styles/QuickLookCompose.css"></style>
