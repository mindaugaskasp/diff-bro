<script setup>
import { useEmailStore } from '../emailStore'
import SettingToggle from '../../../components/SettingToggle.vue'
import AppIcon from '../../../components/AppIcon.vue'

const email = useEmailStore()
</script>

<template>
  <section class="email-settings">
    <h4>{{ $t('email.settings.newMessage') }}</h4>
    <label class="field">
      <span class="field-label">{{ $t('email.settings.subject') }}</span>
      <input
        :value="email.subjectTemplate"
        type="text"
        spellcheck="false"
        @input="email.setSubjectTemplate($event.target.value)"
      />
    </label>
    <label class="field">
      <span class="field-label">{{ $t('email.settings.notePrefilledIntoTheMessage') }}</span>
      <textarea
        :value="email.noteTemplate"
        rows="2"
        @input="email.setNoteTemplate($event.target.value)"
      ></textarea>
    </label>

    <h4>{{ $t('email.settings.afterCreatingTheFile') }}</h4>
    <SettingToggle :checked="email.revealAfterCreate" @change="email.setRevealAfterCreate">
      {{ $t('email.settings.alsoShowTheSealedFile') }}
    </SettingToggle>

    <p class="hint">
      <AppIcon name="mail" />
      <span>
        <i18n-t keypath="email.settings.templateHint" tag="span">
          <template #name><code>{name}</code></template>
          <template #expires><code>{expires}</code></template>
        </i18n-t>
      </span>
    </p>

    <div class="actions">
      <button type="button" class="btn btn-sm" @click="email.resetTemplates()">
        {{ $t('email.settings.resetToDefaults') }}
      </button>
    </div>
  </section>
</template>

<style scoped src="./styles/EmailSettings.css"></style>
