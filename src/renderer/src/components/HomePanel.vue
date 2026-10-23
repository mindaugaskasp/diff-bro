<script setup>
import { computed, onMounted } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useSnippetStore, languageOf } from '../stores/snippetStore'
import { useToolsStore } from '../features/tools'
import { ClaudeInbox, useClaudeStore } from '../features/claude'
import { useHomeActions } from '../composables/useHomeActions'
import { sidebarRecent } from '../utils/sidebarRecent'
import { languageMonogram } from '../utils/languageMonogram'
import { namedTools } from '../utils/tools'
import { toolHue } from '../utils/toolGroups'
import { ago } from '../utils/relativeTime'
import { t } from '../i18n'
import AppIcon from './AppIcon.vue'

const props = defineProps({ search: { type: String, default: '' } })

const vault = useVaultStore()
const snippets = useSnippetStore()
const toolsStore = useToolsStore()
const { openItem } = useHomeActions()
const claude = useClaudeStore()
onMounted(() => claude.loadInbox())

const QUICK_TOOLS = 4
const MAX_PINS = 6
const q = computed(() => props.search.trim().toLowerCase())
const matches = (item) => !q.value || item.name.toLowerCase().includes(q.value)

const glyphOf = (kind, entry) =>
  kind === 'snippet' ? { text: languageMonogram(languageOf(entry)).label.toLowerCase() } : null
const iconOf = { diff: 'diff', received: 'inbox' }

const fromEntry = (kind, entry) => ({
  kind,
  id: entry.id,
  name: entry.name,
  hue: kind,
  icon: iconOf[kind] ?? '',
  glyph: glyphOf(kind, entry),
  tags: entry.tags ?? []
})
const tools = computed(() => namedTools(toolsStore.rows, t))
const toolItem = (tool) => ({
  kind: 'tool',
  id: tool.id,
  name: tool.name,
  action: tool.action,
  hue: toolHue(tool.id),
  icon: tool.icon,
  glyph: null
})

const pinned = computed(() =>
  [
    ...vault.active
      .filter((e) => e.favorite)
      .map((e) => fromEntry(e.from ? 'received' : 'diff', e)),
    ...snippets.entries.filter((e) => e.favorite).map((e) => fromEntry('snippet', e)),
    ...tools.value.filter((tool) => tool.pinned).map(toolItem)
  ]
    .filter(matches)
    .slice(0, MAX_PINS)
)
const recent = computed(() =>
  sidebarRecent({ diffs: vault.active, snippets: snippets.entries, now: vault.now })
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => ({ ...fromEntry(item.kind, item.entry), at: item.at }))
        .filter(matches)
    }))
    .filter((group) => group.items.length)
)
const quick = computed(() =>
  q.value ? [] : namedTools(toolsStore.railRows(QUICK_TOOLS), t).map(toolItem)
)
const KIND_KEY = {
  diff: 'homePanel.kind.diff',
  received: 'homePanel.kind.received',
  snippet: 'homePanel.kind.snippet'
}
const metaOf = (item) => [t(KIND_KEY[item.kind]), ...item.tags].join(' · ')
const isEmpty = computed(
  () => !claude.inbox.length && !pinned.value.length && !recent.value.length && !quick.value.length
)
</script>

<template>
  <div class="home">
    <section v-if="claude.inbox.length" class="home-block">
      <h3 class="home-head">{{ $t('claude.inbox.heading', { n: claude.inbox.length }) }}</h3>
      <ClaudeInbox />
    </section>

    <section v-if="pinned.length" class="home-block">
      <h3 class="home-head">{{ $t('homePanel.pinned') }}</h3>
      <div class="home-grid">
        <button
          v-for="item in pinned"
          :key="`${item.kind}-${item.id}`"
          type="button"
          class="tile home-pin"
          @click="openItem(item)"
        >
          <span class="glyph-well" :data-hue="item.hue">
            <template v-if="item.glyph">{{ item.glyph.text }}</template>
            <AppIcon v-else :name="item.icon" />
          </span>
          <span class="row-2-name">{{ item.name }}</span>
        </button>
      </div>
    </section>

    <section v-if="recent.length" class="home-block">
      <h3 class="home-head">{{ $t('homePanel.recent') }}</h3>
      <template v-for="group in recent" :key="group.key">
        <h4 class="home-day">{{ $t(group.labelKey) }}</h4>
        <button
          v-for="item in group.items"
          :key="`${item.kind}-${item.id}`"
          type="button"
          class="row-2 home-row"
          @click="openItem(item)"
        >
          <span class="glyph-well" :data-hue="item.hue">
            <template v-if="item.glyph">{{ item.glyph.text }}</template>
            <AppIcon v-else :name="item.icon" />
          </span>
          <span class="row-2-text">
            <span class="row-2-name">{{ item.name }}</span>
            <span class="row-2-meta">{{ metaOf(item) }}</span>
          </span>
          <span class="home-age">{{ ago(item.at) }}</span>
        </button>
      </template>
    </section>

    <section v-if="quick.length" class="home-block">
      <h3 class="home-head">{{ $t('homePanel.quickTools') }}</h3>
      <div class="home-grid">
        <button
          v-for="item in quick"
          :key="item.id"
          type="button"
          class="tile"
          @click="openItem(item)"
        >
          <span class="glyph-well" :data-hue="item.hue"><AppIcon :name="item.icon" /></span>
          <span class="row-2-name">{{ item.name }}</span>
        </button>
      </div>
    </section>

    <p v-if="isEmpty" class="home-empty">{{ $t('homePanel.nothingMatches') }}</p>
  </div>
</template>

<style scoped src="./styles/HomePanel.css"></style>
