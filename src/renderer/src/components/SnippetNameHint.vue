<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { expandTemplates, hasTemplate } from '../utils/snippetTemplates'
import { hintFits } from '../utils/fieldHint'

const props = defineProps({
  name: { type: String, default: '' }
})

const INSET = 8
const GAP = 16

const settings = useSettingsStore()
const showsPreview = computed(() => hasTemplate(props.name))
const resolved = computed(() => expandTemplates(props.name, { locale: settings.activeLocale }))
const el = ref(null)
const fits = ref(true)

async function measure() {
  await nextTick()
  const field = el.value?.parentElement
  const typed = field?.querySelector('.ghost-typed')
  if (!typed) return
  fits.value = hintFits({
    typedWidth: typed.offsetWidth,
    hintWidth: el.value.offsetWidth,
    fieldWidth: field.clientWidth,
    inset: INSET,
    gap: GAP
  })
}
watch(() => props.name, measure, { immediate: true })
</script>

<template>
  <span v-if="showsPreview" ref="el" class="name-templates" :class="{ clipped: !fits }">
    <span class="preview">{{ $t('snippetTemplates.savesAs') }} {{ resolved }}</span>
  </span>
</template>

<style scoped src="./styles/SnippetNameHint.css"></style>
