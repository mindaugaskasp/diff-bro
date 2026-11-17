<script setup>
import { computed, watch } from 'vue'
import AppIcon from '../../../components/AppIcon.vue'
import { useTabsStore } from '../../../stores/tabsStore'
import { useDiffStore } from '../../../stores/diffStore'
import { useUiStore } from '../../../stores/uiStore'
import { isSnippetTab } from '../../../utils/tabs'
import { useLanStore } from '../lanStore'

const lan = useLanStore()
const tabs = useTabsStore()
const tab = computed(() => tabs.active)
const received = computed(() => (tab.value ? (lan.received[tab.value.id] ?? null) : null))
const isSnippet = computed(() => isSnippetTab(tab.value))
const savedId = computed(
  () => (isSnippet.value ? tab.value?.snippet?.id : tab.value?.entryId) ?? null
)

watch(savedId, (id) => {
  if (id && received.value) lan.forgetReceived(tab.value.id)
})

function save() {
  if (isSnippet.value) useUiStore().requestSnippetSave()
  else useDiffStore().showSaveDialog = true
}
function discard() {
  const id = tab.value.id
  lan.forgetReceived(id)
  tabs.close(id)
}
</script>

<template>
  <div
    v-if="received"
    class="received-band band"
    role="region"
    :aria-label="$t('lan.received.from', { name: received.from })"
  >
    <span class="glyph-well" data-hue="received"
      ><AppIcon :name="isSnippet ? 'code' : 'diff'"
    /></span>
    <span class="rb-text">{{ $t('lan.received.from', { name: received.from }) }}</span>
    <button type="button" class="btn btn-ghost" @click="discard">
      {{ $t('lan.received.discard') }}
    </button>
    <button type="button" class="btn btn-primary" @click="save">
      {{ $t(isSnippet ? 'lan.received.saveSnippet' : 'lan.received.saveDiff') }}
    </button>
  </div>
</template>

<style scoped src="./styles/ReceivedBar.css"></style>
