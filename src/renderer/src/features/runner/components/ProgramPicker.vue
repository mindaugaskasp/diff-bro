<script setup>
import { computed, ref } from 'vue'
import { useRunnerStore } from '../runnerStore'
import { shaped } from '../../../utils/props'

const props = defineProps({
  language: { type: String, required: true },
  /** @type {import('vue').PropType<import('../../../types').LanguageStatus|null>} */
  status: { type: Object, default: null, validator: shaped('enabled', 'path', 'candidates') }
})

const runner = useRunnerStore()
const candidates = computed(() => props.status?.candidates ?? [])
const chosenIndex = computed(() =>
  candidates.value.findIndex((candidate) => candidate.path === props.status?.path)
)
const typedPath = ref('')

function useTypedPath() {
  const path = typedPath.value.trim()
  if (path) runner.usePath(props.language, path)
}
</script>

<template>
  <div class="program-picker">
    <label v-if="candidates.length" class="picker-line">
      <span class="picker-label">{{ $t('runner.settings.found') }}</span>
      <select :value="chosenIndex" @change="runner.choose(language, Number($event.target.value))">
        <option v-for="(candidate, i) in candidates" :key="candidate.path" :value="i">
          {{ candidate.version }} · {{ candidate.path }}
        </option>
      </select>
    </label>
    <form class="picker-line" @submit.prevent="useTypedPath">
      <input
        v-model="typedPath"
        type="text"
        spellcheck="false"
        :aria-label="$t('runner.settings.typedPath')"
        :placeholder="$t('runner.settings.typedPath')"
      />
      <button type="submit" class="btn btn-sm" :disabled="!typedPath.trim()">
        {{ $t('runner.settings.use') }}
      </button>
      <button type="button" class="btn btn-sm" @click="runner.change(language)">
        {{ $t('runner.settings.browse') }}
      </button>
      <button
        v-if="status?.enabled"
        type="button"
        class="btn btn-sm"
        @click="runner.findAgain(language)"
      >
        {{ $t('runner.settings.findAgain') }}
      </button>
    </form>
  </div>
</template>

<style scoped src="./styles/ProgramPicker.css"></style>
