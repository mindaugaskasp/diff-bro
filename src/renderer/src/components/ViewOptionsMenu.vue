<script setup>
// The four display toggles, behind one button. They were 470px of the toolbar's
// 1114 — the largest block in it, and all of it text, so a longer locale grew it
// further. Here they cost 113px and stop growing.
//
// The panel is also where a toggle can say WHY it is unavailable in a sentence.
// Inline, that reason had nowhere to go but a tooltip.
import { computed, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { usePopover } from '../composables/usePopover'
import { showsSplitView, showsWhitespaceToggle } from '../utils/viewChrome'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()
const { open, toggle, close, onKeydown, backdrop } = usePopover()
const trigger = ref(null)

// A diagram and delimited text both reach the structure toggle with
// structuredFormat null, so availability is asked of the view, not the format.
const rows = computed(() => [
  {
    key: 'split',
    labelKey: 'appToolbar.splitView',
    model: 'renderSideBySide',
    available: showsSplitView(store),
    whyKey: 'appToolbar.why.split',
    isDefault: store.renderSideBySide === true
  },
  {
    key: 'structure',
    labelKey: store.structureLabelKey,
    model: 'semanticView',
    available: store.canCompareStructure || store.canCompareDiagram,
    whyKey: 'appToolbar.why.structure',
    isDefault: store.semanticView === false
  },
  {
    key: 'whitespace',
    labelKey: 'appToolbar.ignoreWhitespace',
    model: 'ignoreTrimWhitespace',
    available: showsWhitespaceToggle(store),
    whyKey: 'appToolbar.why.whitespace',
    isDefault: store.ignoreTrimWhitespace === false
  },
  {
    key: 'focus',
    labelKey: 'appToolbar.focusOnChanges',
    model: 'diagramFocus',
    available: store.comparableKind === 'diagram',
    whyKey: 'appToolbar.why.focus',
    isDefault: store.diagramFocus === true
  }
])

// Options the reader has CHANGED, not options that are on: split view and
// diagram focus both default to true, so an "on" count reads 2 on an untouched
// diagram diff — noise dressed as information.
const changedCount = computed(() => rows.value.filter((r) => r.available && !r.isDefault).length)

defineExpose({ close })
</script>

<template>
  <span class="anchor" @keydown="onKeydown">
    <button
      ref="trigger"
      class="btn"
      :class="{ active: open }"
      :aria-expanded="open"
      aria-haspopup="true"
      :data-tip="$t('appToolbar.tips.view')"
      @click="toggle"
    >
      {{ $t('appToolbar.view') }}
      <span v-if="changedCount" class="btn-count">{{ changedCount }}</span>
      <AppIcon name="chevron-down" />
    </button>
    <div v-if="open" class="popover" role="group" :aria-label="$t('appToolbar.view')">
      <label
        v-for="row in rows"
        :key="row.key"
        class="popover-row"
        :class="{ off: !row.available, stacked: !row.available }"
      >
        <span class="popover-line">
          <input v-model="store[row.model]" type="checkbox" :disabled="!row.available" />
          {{ $t(row.labelKey) }}
        </span>
        <span v-if="!row.available" class="popover-why">{{ $t(row.whyKey) }}</span>
      </label>
    </div>
  </span>
  <Teleport to="body">
    <div
      v-if="open"
      class="popover-backdrop"
      @pointerdown="backdrop.onPointerDown"
      @click="backdrop.onClick"
    />
  </Teleport>
</template>

<style scoped src="./styles/ViewOptionsMenu.css"></style>
