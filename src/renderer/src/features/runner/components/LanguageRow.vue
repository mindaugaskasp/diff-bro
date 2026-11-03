<script setup>
import { computed, ref } from 'vue'
import { useRunnerStore } from '../runnerStore'
import { shaped } from '../../../utils/props'
import SettingToggle from '../../../components/SettingToggle.vue'
import ProgramPicker from './ProgramPicker.vue'

const props = defineProps({
  /** @type {import('vue').PropType<{ id: string, labelKey: string }>} */
  language: { type: Object, required: true, validator: shaped('id', 'labelKey') }
})

const ERROR_KEYS = {
  'not-that-language': 'runner.settings.notThatLanguage',
  'not-absolute': 'runner.settings.notAbsolute',
  'not-a-program': 'runner.settings.notAProgram',
  'none-found': 'runner.settings.noneFound'
}

const runner = useRunnerStore()
const status = computed(() => runner.status?.[props.language.id] ?? null)
const isOn = computed(() => status.value?.enabled === true)
const errorKey = computed(() => ERROR_KEYS[runner.errorFor(props.language.id)] ?? null)
const isRedetected = computed(() => runner.noticeFor(props.language.id) === 'redetected')
const isPickerOpen = ref(false)

// The box ticks itself on click, and a canceled enable has to untick it.
const toggleRemountKey = ref(0)
async function toggle(on) {
  await (on ? runner.enable(props.language.id) : runner.disable(props.language.id))
  toggleRemountKey.value++
}
</script>

<template>
  <div class="lang-row">
    <SettingToggle :key="toggleRemountKey" :checked="isOn" @change="toggle">
      {{ $t(language.labelKey) }}
    </SettingToggle>
    <span class="lang-path" :class="{ 'is-off': !isOn }">
      <template v-if="status?.path">{{ status.path }} · {{ status.version }}</template>
      <template v-else>{{ $t('runner.settings.off') }}</template>
    </span>
    <button
      type="button"
      class="btn btn-sm"
      :class="{ active: isPickerOpen }"
      :aria-expanded="isPickerOpen"
      @click="isPickerOpen = !isPickerOpen"
    >
      {{ $t('runner.settings.change') }}
    </button>
    <p v-if="errorKey" class="lang-message" role="alert">
      {{ $t(errorKey, { language: $t(language.labelKey) }) }}
    </p>
    <p v-else-if="isRedetected" class="lang-message" role="status">
      {{ $t('runner.settings.redetected') }}
    </p>
    <ProgramPicker v-if="isPickerOpen" :language="language.id" :status="status" />
  </div>
</template>

<style scoped src="./styles/LanguageRow.css"></style>
