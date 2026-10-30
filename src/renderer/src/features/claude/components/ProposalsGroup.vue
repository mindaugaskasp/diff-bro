<script setup>
// What Claude proposed, atop Snippets or Diffs (#121). Contained: it scrolls in
// its own height so the library under it never moves.
import { computed, ref } from 'vue'
import { useTabsStore } from '../../../stores/tabsStore'
import { useClaudeStore } from '../claudeStore'
import AppIcon from '../../../components/AppIcon.vue'

const props = defineProps({
  kind: { type: String, required: true, validator: (k) => ['snippet', 'comparison'].includes(k) }
})
const claude = useClaudeStore()
const tabs = useTabsStore()
const selecting = ref(false)

const list = computed(() =>
  props.kind === 'snippet' ? claude.snippetProposals : claude.diffProposals
)
const chosen = computed(() => list.value.filter((p) => claude.selected.includes(p.id)).length)
const isOpen = (id) => claude.reviewing[tabs.activeId] === id
const metaOf = (p) => (p.kind === 'snippet' ? (p.tags ?? []).join(', ') : '')

function toggleSelecting() {
  selecting.value = !selecting.value
  if (!selecting.value) claude.selected = []
}
const pick = (p) => (selecting.value ? claude.toggleSelected(p.id) : claude.open(p.id))
async function act(fn) {
  await fn()
  selecting.value = false
}
</script>

<template>
  <section v-if="list.length" class="proposals" :aria-label="$t('claude.proposals.label')">
    <header class="pg-head band">
      <AppIcon name="sparkle" class="pg-glyph" />
      <span class="pg-title">{{ $t('claude.proposals.title', { n: list.length }) }}</span>
      <button type="button" class="btn btn-sm" @click="toggleSelecting">
        {{ selecting ? $t('claude.proposals.done') : $t('claude.proposals.select') }}
      </button>
    </header>
    <div v-if="selecting" class="pg-selection band">
      <span class="pg-count">{{ $t('claude.proposals.selected', { n: chosen }) }}</span>
      <button
        type="button"
        class="btn btn-sm btn-ghost"
        :disabled="!chosen"
        @click="act(claude.discardSelected)"
      >
        {{ $t('claude.proposals.discardN', { n: chosen }) }}
      </button>
      <button
        type="button"
        class="btn btn-sm btn-primary"
        :disabled="!chosen"
        @click="act(claude.acceptSelected)"
      >
        {{ $t('claude.proposals.acceptN', { n: chosen }) }}
      </button>
    </div>
    <ul class="pg-list">
      <li v-for="p in list" :key="p.id" class="pg-row" :class="{ open: isOpen(p.id) }">
        <button type="button" class="pg-entry" :data-id="p.id" @click="pick(p)">
          <input
            v-if="selecting"
            type="checkbox"
            class="pg-check"
            tabindex="-1"
            :checked="claude.selected.includes(p.id)"
            :aria-label="p.name"
          />
          <span class="glyph-well pg-well" data-hue="received"><AppIcon name="sparkle" /></span>
          <span class="row-2-text">
            <span class="row-2-name">{{ p.name }}</span>
            <span v-if="metaOf(p)" class="row-2-meta">{{ metaOf(p) }}</span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped src="./styles/ProposalsGroup.css"></style>
