<script setup>
import { ref, watch } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useUiStore } from '../stores/uiStore'
import DiffsWhoseSwitch from './DiffsWhoseSwitch.vue'
import { useDiffRows, OWN_GROUPS, RECEIVED_GROUPS } from '../composables/useDiffRows'
import SavedDiffsSection from './SavedDiffsSection.vue'
import ExternalDiffsSection from './ExternalDiffsSection.vue'
import { ProposalsGroup } from '../features/claude'

defineEmits(['manageTag'])
const props = defineProps({
  search: { type: String, default: '' },
  /** @type {import('vue').PropType<string[]>} */
  tags: { type: Array, default: () => [] }
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
const mine = useDiffRows(() => props, OWN_GROUPS).rows
const received = useDiffRows(() => props, RECEIVED_GROUPS).rows
</script>

<template>
  <div class="diffs-panel">
    <SavedDiffsSection
      v-if="whose === 'mine'"
      data-section="saved"
      :search="search"
      :tags="tags"
      @manage-tag="$emit('manageTag', $event)"
    >
      <template #title>
        <DiffsWhoseSwitch v-model:whose="whose" :mine="mine.length" :received="received.length" />
      </template>
      <template #lead><ProposalsGroup kind="comparison" /></template>
    </SavedDiffsSection>
    <ExternalDiffsSection v-else data-section="external" :search="search" :tags="tags">
      <template #title>
        <DiffsWhoseSwitch v-model:whose="whose" :mine="mine.length" :received="received.length" />
      </template>
    </ExternalDiffsSection>
  </div>
</template>

<style scoped src="./styles/DiffsPanel.css"></style>
