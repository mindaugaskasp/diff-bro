<script setup>
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { expandTemplates, hasTemplate } from '../utils/snippetTemplates'

const props = defineProps({
  name: { type: String, default: '' }
})

const settings = useSettingsStore()
const showsPreview = computed(() => hasTemplate(props.name))
const resolved = computed(() => expandTemplates(props.name, { locale: settings.activeLocale }))
</script>

<template>
  <div v-if="showsPreview" class="name-templates">
    <p class="preview">
      {{ $t('snippetTemplates.savesAs') }} <strong>{{ resolved }}</strong>
    </p>
  </div>
</template>

<style scoped src="./styles/SnippetNameHint.css"></style>
