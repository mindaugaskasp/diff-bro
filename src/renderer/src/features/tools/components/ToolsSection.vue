<script setup>
// The "Tools" sidebar section: every registered tool as a row, pinned first.
// Capped at six at rest so it cannot crowd out the library above it; a filter or
// the disclosure shows the rest.
import { computed, ref } from 'vue'
import SectionHeader from '../../../components/SectionHeader.vue'
import AppIcon from '../../../components/AppIcon.vue'
import { useUiStore } from '../../../stores/uiStore'
import ToolRow from './ToolRow.vue'
import { useToolsStore } from '../toolsStore'
import { t } from '../../../i18n'
import { namedTools } from '../../../utils/tools'

const props = defineProps({
  first: { type: Boolean, default: false },
  unified: { type: Boolean, default: false },
  search: { type: String, default: '' },
  /** @type {import('vue').PropType<string[]>} */
  tags: { type: Array, default: () => [] },
  favOnly: { type: Boolean, default: false }
})

const RESTING_ROWS = 6

const store = useToolsStore()
const ui = useUiStore()
const open = ref(true)
const expanded = ref(false)

const q = computed(() => props.search.trim().toLowerCase())
const filtering = computed(() => !!q.value || props.tags.length > 0)

// A tool carries no tags, so any tag filter excludes the whole section. It stays
// visible and reports zero — that IS the answer to "why is this empty".
const matches = computed(() => {
  if (props.tags.length) return []
  const all = namedTools(store.rows, t)
  const rows = props.favOnly ? all.filter((row) => row.pinned) : all
  if (!q.value) return rows
  return rows.filter(
    (row) => row.name.toLowerCase().includes(q.value) || row.kind.toLowerCase().includes(q.value)
  )
})

const shown = computed(() =>
  expanded.value || filtering.value ? matches.value : matches.value.slice(0, RESTING_ROWS)
)
const hidden = computed(() => matches.value.length - shown.value.length)
</script>

<template>
  <section class="sidebar-section">
    <SectionHeader
      section-id="tools"
      :title="$t('menu.tools.title')"
      icon="wrench"
      :open="open"
      :first="first"
      :unified="unified"
      :count="matches.length"
      :filtering="filtering"
      @toggle="open = !open"
    >
      <template #actions>
        <button
          class="btn btn-icon"
          :data-tip="$t('tools.section.searchEveryTool')"
          :aria-label="$t('tools.section.searchEveryTool')"
          @click.stop="ui.openToolsPalette()"
        >
          <AppIcon name="search" />
        </button>
      </template>
    </SectionHeader>

    <div v-show="open" class="section-body">
      <ul class="rows">
        <li v-if="!matches.length" class="empty small">
          {{ $t('tools.section.noToolsMatchTryRemoving') }}
        </li>
        <ToolRow v-for="tool in shown" :key="tool.id" :tool="tool" />

        <li v-if="hidden > 0 || expanded" class="disclosure">
          <span class="star-space"></span>
          <button class="entry" @click="expanded = !expanded">
            <span class="monogram glyph">
              <AppIcon :name="expanded ? 'chevron-up' : 'chevron-down'" />
            </span>
            <span class="nm">
              {{
                expanded
                  ? $t('tools.section.showFewer')
                  : `${hidden} more tool${hidden === 1 ? '' : 's'}`
              }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped src="./styles/ToolsSection.css"></style>
