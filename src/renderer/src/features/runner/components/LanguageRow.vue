<script setup>
import { computed, ref } from 'vue'
import { useRunnerStore } from '../runnerStore'
import { useProgramField, useStopAfter } from '../useProgramField'
import { shaped } from '../../../utils/props'
import SettingToggle from '../../../components/SettingToggle.vue'
import AppIcon from '../../../components/AppIcon.vue'
import ProgramMenu from './ProgramMenu.vue'

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
const { draft, version, programs, hasMenu, canFindAgain, menu, submit, choose, findAgain, browse } =
  useProgramField(props.language.id, status)
const { open: isMenuOpen, toggle: toggleMenu, onKeydown: onMenuKeydown, backdrop } = menu
const stopAfter = useStopAfter(props.language.id, status)

// The box ticks itself on click, and a canceled enable has to untick it.
const toggleRemountKey = ref(0)
async function toggle(on) {
  await (on ? runner.enable(props.language.id) : runner.disable(props.language.id))
  toggleRemountKey.value++
}
</script>

<template>
  <div class="lang-row" :class="{ 'is-off': !isOn }">
    <SettingToggle :key="toggleRemountKey" :checked="isOn" @change="toggle">
      {{ $t(language.labelKey) }}
    </SettingToggle>
    <div class="lang-field anchor" @keydown="onMenuKeydown">
      <input
        v-model="draft"
        class="lang-path"
        type="text"
        spellcheck="false"
        :aria-label="$t('runner.settings.typedPath')"
        :placeholder="$t('runner.settings.foundWhenOn')"
        @keydown.enter.prevent="submit"
      />
      <span v-if="version" class="lang-version">{{ version }}</span>
      <button
        v-if="hasMenu"
        type="button"
        class="btn btn-icon lang-chevron"
        aria-haspopup="menu"
        :aria-expanded="isMenuOpen"
        :aria-label="$t('runner.settings.found')"
        :data-tip="$t('runner.settings.found')"
        @click="toggleMenu"
      >
        <AppIcon name="chevron-down" />
      </button>
      <ProgramMenu
        v-if="isMenuOpen"
        :programs="programs"
        :can-find-again="canFindAgain"
        @choose="choose"
        @find-again="findAgain"
      />
    </div>
    <button type="button" class="btn btn-sm lang-browse" @click="browse">
      {{ $t('runner.settings.browse') }}
    </button>
    <i18n-t keypath="runner.settings.stopAfter" tag="label" class="lang-limit">
      <template #minutes>
        <input
          class="lang-minutes"
          type="number"
          min="0"
          step="1"
          :value="stopAfter.minutes.value"
          :data-tip="$t('runner.settings.noLimitTip')"
          @change="stopAfter.commit"
        />
      </template>
    </i18n-t>
    <p v-if="errorKey" class="lang-message" role="alert">
      {{ $t(errorKey, { language: $t(language.labelKey) }) }}
    </p>
    <p v-else-if="isRedetected" class="lang-message" role="status">
      {{ $t('runner.settings.redetected') }}
    </p>
    <div
      v-if="isMenuOpen"
      class="popover-backdrop"
      @pointerdown="backdrop.onPointerDown"
      @click="backdrop.onClick"
    />
  </div>
</template>

<style scoped src="./styles/LanguageRow.css"></style>
