<script setup>
// Template placeholders for a snippet's name. A TOOLTIP, not a disclosure: the
// nine tokens are reference material read once and then remembered, so a button
// charged every reader a click and a two-row layout shift — in a dialog that
// already scrolls on a small window — to re-read something they mostly knew. The
// hint itself stays permanently visible, because that is what makes the feature
// discoverable without already knowing it exists.
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { TEMPLATE_TOKENS, expandTemplates, hasTemplate } from '../utils/snippetTemplates'
import { t } from '../i18n'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  name: { type: String, default: '' }
})

const settings = useSettingsStore()

const showsPreview = computed(() => hasTemplate(props.name))
const resolved = computed(() => expandTemplates(props.name, { locale: settings.activeLocale }))

// One message per line — the bubble is `white-space: pre-line`. Each token gets
// what it MEANS as well as what it resolves to right now: a bare `{{week}} 32`
// leaves the reader to guess, and the tip has the room the inline list did not.
// Resolved against the same clock as the preview, so an example can never
// contradict what the field says it will save.
const tip = computed(() =>
  [
    t('snippetTemplates.tip'),
    ...TEMPLATE_TOKENS.map((spec) => {
      const value = expandTemplates(`{{${spec.token}}}`, { locale: settings.activeLocale })
      return `{{${spec.token}}} — ${t(spec.labelKey)} (${value})`
    })
  ].join('\n')
)
</script>

<template>
  <div class="name-templates">
    <!-- Focusable so the tip is reachable by keyboard: AppTooltip shows on
         focusin as well as hover. Not a button — there is nothing to press. -->
    <span class="tokens-hint" tabindex="0" :data-tip="tip">
      <AppIcon name="braces" /> {{ $t('snippetTemplates.tokens') }}
    </span>
    <p v-if="showsPreview" class="preview">
      {{ $t('snippetTemplates.savesAs') }} <strong>{{ resolved }}</strong>
    </p>
  </div>
</template>

<style scoped src="./styles/SnippetNameHint.css"></style>
