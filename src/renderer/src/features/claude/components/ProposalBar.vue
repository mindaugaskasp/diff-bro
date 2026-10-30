<script setup>
// Over a tab reviewing a Claude proposal (#121). Every field in the tab is
// editable; Accept saves the reader's version through the ordinary save, and the
// proposal is filed away once that tab has a saved id.
import { computed, watch } from 'vue'
import { useTabsStore } from '../../../stores/tabsStore'
import { useDiffStore } from '../../../stores/diffStore'
import { useUiStore } from '../../../stores/uiStore'
import { isSnippetTab } from '../../../utils/tabs'
import { useClaudeStore } from '../claudeStore'
import AppIcon from '../../../components/AppIcon.vue'

const claude = useClaudeStore()
const tabs = useTabsStore()
const tab = computed(() => tabs.active)
const proposalId = computed(() => (tab.value ? (claude.reviewing[tab.value.id] ?? null) : null))
const proposal = computed(() => claude.inbox.find((p) => p.id === proposalId.value) ?? null)
const isSnippet = computed(() => isSnippetTab(tab.value))
const savedId = computed(
  () => (isSnippet.value ? tab.value?.snippet?.id : tab.value?.entryId) ?? null
)

watch(savedId, (id) => {
  if (!id || !proposalId.value) return
  claude.settleAccepted(proposalId.value, id)
  claude.stopReviewing(tab.value.id)
})

function accept() {
  if (isSnippet.value) useUiStore().requestSnippetSave()
  else useDiffStore().showSaveDialog = true
}
function discard() {
  const id = tab.value.id
  claude.discard(proposalId.value)
  claude.stopReviewing(id)
  tabs.close(id)
}
</script>

<template>
  <div
    v-if="proposalId"
    class="proposal-bar band"
    role="region"
    :aria-label="$t('claude.bar.title')"
  >
    <span class="glyph-well" data-hue="received"><AppIcon name="sparkle" /></span>
    <span class="pb-text">
      <strong class="pb-title">{{ $t('claude.bar.title') }}</strong>
      <span v-if="proposal?.note" class="pb-note">{{
        $t('claude.bar.note', { note: proposal.note })
      }}</span>
    </span>
    <button type="button" class="btn btn-ghost" @click="discard">
      {{ $t('claude.bar.discard') }}
    </button>
    <button type="button" class="btn btn-primary" @click="accept">
      {{ isSnippet ? $t('claude.bar.acceptSnippet') : $t('claude.bar.acceptDiff') }}
    </button>
  </div>
</template>

<style scoped src="./styles/ProposalBar.css"></style>
