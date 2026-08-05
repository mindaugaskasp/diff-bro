<script setup>
// What a templated name will actually be saved as. Shown only once the field
// holds a placeholder, so an ordinary name never sees it — and the preview is
// the documentation: the token list appears in the same moment it becomes
// relevant, rather than sitting under every name field forever.
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { TEMPLATE_TOKENS, expandTemplates, hasTemplate } from '../utils/snippetTemplates'

const props = defineProps({
  name: { type: String, default: '' }
})

const settings = useSettingsStore()
const showing = computed(() => hasTemplate(props.name))
const resolved = computed(() => expandTemplates(props.name, { locale: settings.activeLocale }))
// The same clock the preview uses, so an example can never contradict it.
const examples = computed(() =>
  TEMPLATE_TOKENS.map((spec) => ({
    token: `{{${spec.token}}}`,
    value: expandTemplates(`{{${spec.token}}}`, { locale: settings.activeLocale })
  }))
)
</script>

<template>
  <div v-if="showing" class="name-hint">
    <p class="preview">
      {{ $t('snippetTemplates.savesAs') }} <strong>{{ resolved }}</strong>
    </p>
    <ul class="tokens">
      <li v-for="e in examples" :key="e.token">
        <code>{{ e.token }}</code>
        <span>{{ e.value }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped src="./styles/SnippetNameHint.css"></style>
