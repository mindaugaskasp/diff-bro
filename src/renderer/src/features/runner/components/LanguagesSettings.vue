<script setup>
import { computed, onMounted, ref } from 'vue'
import { RUNNER_LANGUAGES, useRunnerStore } from '../runnerStore'
import SettingToggle from '../../../components/SettingToggle.vue'

const runner = useRunnerStore()
onMounted(() => runner.load())

const rows = computed(() =>
  RUNNER_LANGUAGES.map((lang) => ({
    ...lang,
    status: runner.status?.[lang.id] ?? null,
    isWrongProgram: runner.errorFor(lang.id) === 'not-that-language'
  }))
)

// The box ticks itself on click, and a canceled enable has to untick it.
const toggleRemountKey = ref(0)
async function toggle(language, on) {
  await (on ? runner.enable(language) : runner.disable(language))
  toggleRemountKey.value++
}
</script>

<template>
  <section class="languages">
    <h4>{{ $t('runner.settings.languages') }}</h4>
    <p class="dialog-note">{{ $t('runner.settings.intro') }}</p>
    <div v-for="row in rows" :key="row.id" class="lang-row">
      <SettingToggle
        :key="toggleRemountKey"
        :checked="!!row.status?.enabled"
        @change="toggle(row.id, $event)"
      >
        {{ $t(row.labelKey) }}
      </SettingToggle>
      <span class="lang-path">
        <template v-if="row.status?.enabled">
          {{ row.status.path }} · {{ row.status.version }}
        </template>
        <template v-else>{{ $t('runner.settings.off') }}</template>
      </span>
      <button
        v-if="row.status?.enabled"
        type="button"
        class="btn btn-sm"
        @click="runner.change(row.id)"
      >
        {{ $t('runner.settings.change') }}
      </button>
      <p v-if="row.isWrongProgram" class="lang-error" role="alert">
        {{ $t('runner.settings.notThatLanguage', { language: $t(row.labelKey) }) }}
      </p>
    </div>
  </section>
</template>

<style scoped src="./styles/LanguagesSettings.css"></style>
