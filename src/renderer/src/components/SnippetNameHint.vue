<script setup>
// Template placeholders for a snippet's name. The BUTTON is always there, so the
// feature is discoverable without a placeholder already typed; the list it opens
// is not, because nine tokens permanently under the field cost two lines of a
// dialog that already scrolls on a small window.
import { computed, ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { TEMPLATE_TOKENS, expandTemplates, hasTemplate } from '../utils/snippetTemplates'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  name: { type: String, default: '' }
})

const settings = useSettingsStore()
const open = ref(false)

const showsPreview = computed(() => hasTemplate(props.name))
const resolved = computed(() => expandTemplates(props.name, { locale: settings.activeLocale }))
// Resolved against the same clock as the preview, so an example can never
// contradict what the field says it will save.
const examples = computed(() =>
  TEMPLATE_TOKENS.map((spec) => ({
    token: `{{${spec.token}}}`,
    value: expandTemplates(`{{${spec.token}}}`, { locale: settings.activeLocale })
  }))
)
</script>

<template>
  <div class="name-templates">
    <div class="row">
      <button
        type="button"
        class="btn btn-sm"
        :class="{ active: open }"
        :aria-expanded="open"
        :data-tip="$t('snippetTemplates.tip')"
        @click="open = !open"
      >
        <AppIcon name="braces" /> {{ $t('snippetTemplates.tokens') }}
      </button>
      <p v-if="showsPreview" class="preview">
        {{ $t('snippetTemplates.savesAs') }} <strong>{{ resolved }}</strong>
      </p>
    </div>
    <ul v-if="open" class="tokens">
      <li v-for="e in examples" :key="e.token">
        <code>{{ e.token }}</code>
        <span>{{ e.value }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped src="./styles/SnippetNameHint.css"></style>
