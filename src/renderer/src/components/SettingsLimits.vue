<script setup>
// The Settings → Limits pane, split out of SettingsDialog to keep it within
// its line budget. Shares SettingsDialog.css.
import {
  useSettingsStore,
  FILE_TYPE_LIMITS,
  MAX_SNIPPET_SIZE_KB_CAP,
  MAX_EXPORT_HEIGHT_PX_CAP,
  MIN_EXPORT_HEIGHT_PX
} from '../stores/settingsStore'

const settings = useSettingsStore()
</script>

<template>
  <section>
    <h4>Limits</h4>
    <label v-for="(spec, type) in FILE_TYPE_LIMITS" :key="type" class="row">
      <span>Max {{ spec.label }} file (MB)</span>
      <input
        type="number"
        min="1"
        :max="spec.cap"
        :value="settings.fileSizeLimitMb(type)"
        @change="settings.setFileSizeLimitMb(type, $event.target.value)"
      />
    </label>
    <label class="row">
      <span>Max snippet size (KB)</span>
      <input
        type="number"
        min="16"
        :max="MAX_SNIPPET_SIZE_KB_CAP"
        :value="settings.maxSnippetSizeKb"
        @change="settings.setMaxSnippetSizeKb($event.target.value)"
      />
    </label>
    <label class="row">
      <span>Max diff image height (px)</span>
      <input
        type="number"
        :min="MIN_EXPORT_HEIGHT_PX"
        :max="MAX_EXPORT_HEIGHT_PX_CAP"
        step="500"
        :value="settings.maxExportHeightPx"
        @change="settings.setMaxExportHeightPx($event.target.value)"
      />
    </label>
    <p class="hint">
      Higher limits let you diff or store bigger content, at the cost of speed — raise them only if
      you need to. The image height is how much of a long diff one exported picture covers, measured
      on screen, so it captures the same amount whatever your display's scaling; a longer diff is
      cut short and says so.
    </p>
  </section>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
