<script setup>
// The Settings → Limits pane, split out of SettingsDialog to keep it within
// its line budget. Shares SettingsDialog.css.
import { useSettingsStore } from '../stores/settingsStore'
import {
  FILE_TYPE_LIMITS,
  MAX_SNIPPET_SIZE_KB_CAP,
  MAX_EXPORT_HEIGHT_PX_CAP,
  MIN_EXPORT_HEIGHT_PX
} from '../utils/settingsDefaults'

const settings = useSettingsStore()
</script>

<template>
  <section>
    <h4>{{ $t('settingsLimits.limits') }}</h4>
    <label v-for="(spec, type) in FILE_TYPE_LIMITS" :key="type" class="row">
      <span>{{ $t('settingsLimits.maxFileMb', { kind: spec.label }) }}</span>
      <input
        type="number"
        min="1"
        :max="spec.cap"
        :value="settings.fileSizeLimitMb(type)"
        @change="settings.setFileSizeLimitMb(type, $event.target.value)"
      />
    </label>
    <label class="row">
      <span>{{ $t('settingsLimits.maxSnippetSizeKB') }}</span>
      <input
        type="number"
        min="16"
        :max="MAX_SNIPPET_SIZE_KB_CAP"
        :value="settings.maxSnippetSizeKb"
        @change="settings.setLimit('maxSnippetSizeKb', $event.target.value)"
      />
    </label>
    <label class="row">
      <span>{{ $t('settingsLimits.maxDiffImageHeightPx') }}</span>
      <input
        type="number"
        :min="MIN_EXPORT_HEIGHT_PX"
        :max="MAX_EXPORT_HEIGHT_PX_CAP"
        step="500"
        :value="settings.maxExportHeightPx"
        @change="settings.setLimit('maxExportHeightPx', $event.target.value)"
      />
    </label>
    <p class="hint">
      {{ $t('settingsLimits.higherLimitsLetYouDiff') }}
    </p>
  </section>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
