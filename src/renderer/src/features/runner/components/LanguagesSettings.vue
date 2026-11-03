<script setup>
import { onMounted } from 'vue'
import { RUNNER_LANGUAGES, useRunnerStore } from '../runnerStore'
import LanguageRow from './LanguageRow.vue'

const runner = useRunnerStore()
onMounted(() => runner.load())
</script>

<template>
  <section class="languages">
    <h4>{{ $t('runner.settings.languages') }}</h4>
    <p class="dialog-note">{{ $t('runner.settings.intro') }}</p>
    <LanguageRow v-for="lang in RUNNER_LANGUAGES" :key="lang.id" :language="lang" />
  </section>
</template>

<style scoped src="./styles/LanguagesSettings.css"></style>
