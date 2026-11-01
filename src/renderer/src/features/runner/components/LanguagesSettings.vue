<script setup>
import { onMounted, ref } from 'vue'
import { RUNNER_LANGUAGES, useRunnerStore } from '../runnerStore'
import SettingToggle from '../../../components/SettingToggle.vue'

const runner = useRunnerStore()
onMounted(() => runner.load())

// The box ticks itself on click, and a cancelled enable has to untick it.
const rendered = ref(0)
async function toggle(language, on) {
  await (on ? runner.enable(language) : runner.disable(language))
  rendered.value++
}
const stateOf = (language) => runner.status?.[language]
</script>

<template>
  <section class="languages">
    <h4>{{ $t('runner.settings.languages') }}</h4>
    <p class="dialog-note">{{ $t('runner.settings.intro') }}</p>
    <div v-for="lang in RUNNER_LANGUAGES" :key="lang.id" class="lang-row">
      <SettingToggle
        :key="rendered"
        :checked="!!stateOf(lang.id)?.enabled"
        @change="toggle(lang.id, $event)"
      >
        {{ $t(lang.labelKey) }}
      </SettingToggle>
      <span class="lang-path">
        <template v-if="stateOf(lang.id)?.enabled">
          {{ stateOf(lang.id).path }} · {{ stateOf(lang.id).version }}
        </template>
        <template v-else>{{ $t('runner.settings.off') }}</template>
      </span>
      <button
        type="button"
        class="btn btn-sm"
        :disabled="!stateOf(lang.id)?.enabled"
        @click="runner.change(lang.id)"
      >
        {{
          stateOf(lang.id)?.enabled ? $t('runner.settings.change') : $t('runner.settings.choose')
        }}
      </button>
      <p v-if="runner.errorFor(lang.id)" class="lang-error" role="alert">
        {{ $t('runner.settings.notThatLanguage', { language: $t(lang.labelKey) }) }}
      </p>
    </div>
  </section>
</template>

<style scoped src="./styles/LanguagesSettings.css"></style>
