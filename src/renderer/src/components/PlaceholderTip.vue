<script setup>
import { useSettingsStore } from '../stores/settingsStore'

const settings = useSettingsStore()
// Held in script so the literal braces don't close the mustache.
const token = '{{placeholderValue}}'
</script>

<template>
  <p v-if="settings.placeholderTip" class="placeholder-tip">
    <i18n-t keypath="snippetDocument.placeholderTip" tag="span">
      <template #token
        ><code>{{ token }}</code></template
      >
    </i18n-t>
    <button type="button" class="tip-exit" @click="settings.dismissPlaceholderTip()">
      {{ $t('snippetDocument.dontShowThisAgain') }}
    </button>
  </p>
</template>

<style scoped src="./styles/PlaceholderTip.css"></style>
