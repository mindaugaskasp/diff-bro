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
    :title="$t('email.handoffDialog.emailThisDiff')"
    :escape-closes="false"
    @close="email.cancel()"
  >
    <form class="dialog-form" @submit.prevent="email.send(note)">
      <div class="field">
        <span class="field-label">{{ $t('email.handoffDialog.toFromTheirTrustedKeys') }}</span>
        <ul class="to">
          <li v-for="r in email.draft.to" :key="r.fingerprint ?? r.email" class="chip">
            <AppIcon name="shield" />
            <span class="who">{{ r.label }}</span>
            <span class="addr">{{ r.email }}</span>
          </li>
        </ul>
      </div>

      <label class="field">
        <span class="field-label">{{ $t('email.handoffDialog.note') }}</span>
        <textarea
          v-model="note"
          rows="3"
          :placeholder="$t('email.handoffDialog.optionalGoesInTheMessage')"
        />
      </label>

      <p class="strip">
        <AppIcon name="clipboard" />
        <span>
          {{ $t('email.handoffDialog.yourMailAppOpensWith') }}
          <strong>paste it into the draft</strong> and send it yourself.
        </span>
      </p>

      <div class="dialog-actions">
        <button type="submit" class="btn btn-primary" :disabled="email.sending">
          {{ email.sending ? 'Creating…' : 'Create & open mail' }}
        </button>
        <span class="spacer" />
        <button type="button" class="btn btn-ghost" @click="email.cancel()">
          {{ $t('common.cancel') }}
        </button>
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped src="./styles/EmailHandoffDialog.css"></style>
