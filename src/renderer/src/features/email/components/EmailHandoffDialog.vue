<script setup>
import { ref } from 'vue'
import { useEmailStore } from '../emailStore'
import BaseDialog from '../../../components/BaseDialog.vue'
import AppIcon from '../../../components/AppIcon.vue'

const email = useEmailStore()
const note = ref(email.noteTemplate)
</script>

<template>
  <BaseDialog
    v-if="email.draft"
    width="440px"
    title="Email this diff"
    :escape-closes="false"
    @close="email.cancel()"
  >
    <form class="dialog-form" @submit.prevent="email.send(note)">
      <div class="field">
        <span class="field-label">To — from their trusted keys, not typed here</span>
        <ul class="to">
          <li v-for="r in email.draft.to" :key="r.fingerprint ?? r.email" class="chip">
            <AppIcon name="shield" />
            <span class="who">{{ r.label }}</span>
            <span class="addr">{{ r.email }}</span>
          </li>
        </ul>
      </div>

      <label class="field">
        <span class="field-label">Note</span>
        <textarea v-model="note" rows="3" placeholder="Optional — goes in the message body" />
      </label>

      <p class="strip">
        <AppIcon name="clipboard" />
        <span>
          Your mail app opens with this message. The sealed file goes on the clipboard —
          <strong>paste it into the draft</strong> and send it yourself.
        </span>
      </p>

      <div class="dialog-actions">
        <button type="submit" class="btn btn-primary" :disabled="email.sending">
          {{ email.sending ? 'Creating…' : 'Create & open mail' }}
        </button>
        <span class="spacer" />
        <button type="button" class="btn btn-ghost" @click="email.cancel()">Cancel</button>
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped src="./styles/EmailHandoffDialog.css"></style>
