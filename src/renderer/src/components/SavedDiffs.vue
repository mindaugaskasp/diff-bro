<script setup>
// The sidebar shell. It owns nothing but the order of its three sections —
// Saved diffs, External diffs, and Snippets — which the user can rearrange
// (SectionHeader's up/down controls, persisted in settings). Each section is a
// self-contained component; this file just renders them in the chosen order and
// keeps the vault countdowns ticking.
import { onMounted, onBeforeUnmount } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useSettingsStore } from '../stores/settingsStore'
import SavedDiffsSection from './SavedDiffsSection.vue'
import ExternalDiffsSection from './ExternalDiffsSection.vue'
import SnippetsPanel from './SnippetsPanel.vue'

const vault = useVaultStore()
const settings = useSettingsStore()

let timer = null
onMounted(() => {
  vault.tick()
  // 1 s tick: keeps the countdowns live and purges entries the moment they expire.
  timer = setInterval(() => vault.tick(), 1000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <aside class="saved">
    <template v-for="(id, i) in settings.orderedSections" :key="id">
      <SavedDiffsSection v-if="id === 'saved'" :first="i === 0" />
      <ExternalDiffsSection v-else-if="id === 'external'" :first="i === 0" />
      <SnippetsPanel v-else-if="id === 'snippets'" :first="i === 0" />
    </template>
  </aside>
</template>

<style scoped src="./styles/SavedDiffs.css"></style>
