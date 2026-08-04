<script setup>
import { useEmailStore } from '../emailStore'
import SettingToggle from '../../../components/SettingToggle.vue'
import AppIcon from '../../../components/AppIcon.vue'

const email = useEmailStore()
</script>

<template>
  <section class="email-settings">
    <h4>New message</h4>
    <label class="field">
      <span class="field-label">Subject</span>
      <input
        :value="email.subjectTemplate"
        type="text"
        spellcheck="false"
        @input="email.setSubjectTemplate($event.target.value)"
      />
    </label>
    <label class="field">
      <span class="field-label">Note — prefilled into the message body</span>
      <textarea
        :value="email.noteTemplate"
        rows="2"
        @input="email.setNoteTemplate($event.target.value)"
      ></textarea>
    </label>

    <h4>After creating the file</h4>
    <SettingToggle :checked="email.revealAfterCreate" @change="email.setRevealAfterCreate">
      Also show the sealed file in your file manager
    </SettingToggle>

    <p class="hint">
      <AppIcon name="mail" />
      <span>
        <code>{name}</code> and <code>{expires}</code> are filled in from the diff. Your mail app
        sends the message — Diff Bro opens it and copies the sealed file so you can paste it in.
      </span>
    </p>

    <div class="actions">
      <button type="button" class="btn btn-sm" @click="email.resetTemplates()">
        Reset to defaults
      </button>
    </div>
  </section>
</template>

<style scoped src="./styles/EmailSettings.css"></style>
