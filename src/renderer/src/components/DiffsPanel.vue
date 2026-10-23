<script setup>
import { computed, ref, watch } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useUiStore } from '../stores/uiStore'
import { t } from '../i18n'
import SegmentedControl from './SegmentedControl.vue'
import SavedDiffsSection from './SavedDiffsSection.vue'
import ExternalDiffsSection from './ExternalDiffsSection.vue'

defineProps({
  search: { type: String, default: '' },
  /** @type {import('vue').PropType<string[]>} */
  tags: { type: Array, default: () => [] },
  favOnly: { type: Boolean, default: false }
})

const vault = useVaultStore()
const ui = useUiStore()
const whose = ref('mine')
watch(
  () => ui.lastCreatedRowId,
  (id) => {
    const entry = vault.entries.find((e) => e.id === id)
    if (entry) whose.value = entry.from ? 'received' : 'mine'
  },
  { immediate: true }
)
const options = computed(() => [
  {
    value: 'mine',
    label: t('diffsPanel.mine', { n: vault.active.length - vault.importedActive.length })
  },
  { value: 'received', label: t('diffsPanel.received', { n: vault.importedActive.length }) }
])
</script>

<template>
  <div class="diffs-panel">
    <div class="diffs-whose">
      <SegmentedControl v-model:value="whose" :options="options" compact />
    </div>
    <SavedDiffsSection
      v-if="whose === 'mine'"
      data-section="saved"
      first
      panel
      :search="search"
      :tags="tags"
      :fav-only="favOnly"
    />
    <ExternalDiffsSection
      v-else
      data-section="external"
      first
      panel
      :search="search"
      :tags="tags"
      :fav-only="favOnly"
    />
  </div>
</template>

<style scoped src="./styles/DiffsPanel.css"></style>
