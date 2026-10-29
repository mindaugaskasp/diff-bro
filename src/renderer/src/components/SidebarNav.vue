<script setup>
// The sidebar's four places as one segmented control (#144), in a fixed order.
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settingsStore'
import { useSidebarNavKeys } from '../composables/useSidebarNavKeys'
import { useClaudeStore } from '../features/claude'
import SegmentedControl from './SegmentedControl.vue'

const PLACES = [
  { value: 'home', icon: 'home', labelKey: 'sidebarNav.home' },
  { value: 'diffs', icon: 'diff', labelKey: 'sidebarNav.diffs' },
  { value: 'snippets', icon: 'code', labelKey: 'sidebarNav.snippets' },
  { value: 'tools', icon: 'grid', labelKey: 'sidebarNav.tools' }
]

const { t } = useI18n()
const settings = useSettingsStore()
const el = ref(null)
const claude = useClaudeStore()
onMounted(() => claude.loadInbox())
// Claude's proposals wait in Snippets and Diffs, and the segment says how many.
const waiting = computed(() => ({
  snippets: claude.snippetProposals.length,
  diffs: claude.diffProposals.length
}))
const options = computed(() =>
  PLACES.map((p) => {
    const label = t(p.labelKey)
    const n = waiting.value[p.value] ?? 0
    return n
      ? { ...p, label, badge: n, badgeLabel: t('sidebarNav.waiting', { place: label, n }) }
      : { ...p, label }
  })
)
const panel = computed({
  get: () => settings.sidebarPanel,
  set: (id) => settings.setSidebarPanel(id)
})

async function selectByKey(id) {
  panel.value = id
  await nextTick()
  el.value?.querySelector(`[data-value="${id}"]`)?.focus()
}
const onKeydown = useSidebarNavKeys(
  computed(() => PLACES.map((p) => p.value)),
  panel,
  selectByKey
)
</script>

<template>
  <nav ref="el" class="sidebar-nav band" :aria-label="$t('sidebarNav.label')" @keydown="onKeydown">
    <SegmentedControl v-model:value="panel" :options="options" compact />
  </nav>
</template>

<style scoped src="./styles/SidebarNav.css"></style>
