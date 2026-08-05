<script setup>
import { computed, ref, watch } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { modelFrom } from '../utils/diagramModel'
import { diffDiagrams } from '../utils/diagramDiff'
import { unionSource } from '../utils/diagramUnion'
import { focusDiff } from '../utils/diagramFocus'
import { naturalWidthOf } from '../utils/svgNaturalWidth'
import { useZoomPan } from '../composables/useZoomPan'
import AppIcon from './AppIcon.vue'
import MermaidDiagram from './MermaidDiagram.vue'
import DiagramChangeRegister from './DiagramChangeRegister.vue'

const store = useDiffStore()
const source = ref('')
const beforeSrc = ref('')
const afterSrc = ref('')
const error = ref('')
const full = ref(null)
const hidden = ref(0)
const type = ref('')
// Only the newest build may write: two model parses are awaited, so a slower
// earlier run can resolve after a newer one and leave the picture showing one
// revision while the register shows another. Same guard MermaidDiagram carries.
let buildSeq = 0
// The same pan/zoom the Mermaid viewer dialog uses — a 35-node service map is
// unreadable at fit-width, and a second gesture implementation would drift.
const { scale, tx, ty, pct, zoom, fit, onWheel, onDown, onMove, onUp } = useZoomPan()
const stage = ref(null)

const changed = (list) => (list ?? []).filter((x) => x.status !== 'same')
const tally = (list, status) => (list ?? []).filter((x) => x.status === status).length

// Give the rendered svg the width its layout asked for, so the diagram is read
// at its own size and the stage scrolls — rather than shrunk to fit a pane.
function sizeToNatural() {
  for (const svg of stage.value?.querySelectorAll('svg') ?? []) {
    const width = naturalWidthOf(svg.getAttribute('viewBox'))
    if (!width) continue
    svg.style.width = `${width}px`
    svg.style.maxWidth = 'none'
    svg.style.height = 'auto'
  }
}

const zoomStyle = computed(() => ({
  transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
  transformOrigin: 'top center'
}))

const nodeRows = computed(() => changed(full.value?.nodes))
const edgeRows = computed(() => changed(full.value?.edges))
const hasRegister = computed(() => nodeRows.value.length > 0 || edgeRows.value.length > 0)
// Collapsed by default: the picture is what a diagram diff is for, and the
// reading rail costs it 232px. The status band already says what changed in
// words, so the list is the detail you open when you want it.
const showRegister = ref(false)

async function build() {
  const mine = ++buildSeq
  error.value = ''
  const [a, b] = [await modelFrom(store.left?.content), await modelFrom(store.right?.content)]
  if (mine !== buildSeq) return
  if (!a || !b) {
    error.value = 'This diagram type can’t be compared as a picture yet.'
    return
  }
  if (a.error || b.error) {
    error.value = a.error || b.error
    return
  }
  const result = diffDiagrams(a, b)
  const shown = store.diagramFocus ? focusDiff(result, 1) : { ...result, hidden: 0 }
  full.value = result
  hidden.value = shown.hidden
  type.value = b.type
  source.value = unionSource(shown, b.type)
  // Side by side is each revision on its own, still status-coloured: the left
  // cannot know about what arrived, the right cannot know about what left.
  beforeSrc.value = unionSource(onlySide(shown, BEFORE), b.type)
  afterSrc.value = unionSource(onlySide(shown, AFTER), b.type)
}

const BEFORE = new Set(['same', 'removed', 'changed'])
const AFTER = new Set(['same', 'added', 'changed', 'renamed'])
const onlySide = (d, keep) => ({
  nodes: d.nodes.filter((n) => keep.has(n.status)),
  edges: d.edges.filter((e) => keep.has(e.status))
})

watch(
  () => [store.left?.content, store.right?.content, store.diagramFocus, store.diffRevision],
  build,
  {
    immediate: true
  }
)
</script>

<template>
  <div class="dgv">
    <div class="dg-legend">
      <span class="lg add"><span class="lgchip">+</span>added</span>
      <span class="lg del"><span class="lgchip">−</span>removed</span>
      <span class="lg chg"><span class="lgchip">±</span>changed</span>
      <span class="lg same"><span class="lgchip">·</span>unchanged</span>
      <span class="lg-right">
        <button class="dg-zbtn" data-tip="Zoom out" aria-label="Zoom out" @click="zoom(1 / 1.2)">
          <AppIcon name="minus" />
        </button>
        <button class="dg-pct" data-tip="Reset to fit" @click="fit">{{ pct }}%</button>
        <button class="dg-zbtn" data-tip="Zoom in" aria-label="Zoom in" @click="zoom(1.2)">
          <AppIcon name="plus" />
        </button>
        <button
          v-if="hasRegister"
          class="dg-zbtn"
          :data-tip="showRegister ? 'Hide the change list' : 'Show the change list'"
          :aria-label="showRegister ? 'Hide the change list' : 'Show the change list'"
          :aria-pressed="showRegister"
          @click="showRegister = !showRegister"
        >
          <AppIcon name="list" />
        </button>
        <span class="dg-type">{{ type }}</span>
      </span>
    </div>

    <p v-if="store.renderSideBySide && !error" class="dg-drift">
      Aligned at the first node — below it each revision was laid out on its own, so an unchanged
      node can still sit at a different height.
    </p>

    <div class="dg-body">
      <div
        ref="stage"
        class="dg-stage"
        :class="{ split: store.renderSideBySide }"
        @wheel="onWheel"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      >
        <p v-if="error" class="dg-error">{{ error }}</p>
        <div v-else class="dg-zoom" :style="zoomStyle">
          <template v-if="store.renderSideBySide">
            <div class="dg-pane">
              <span class="dg-ttl">before</span>
              <MermaidDiagram :code="beforeSrc" :debounce="0" @rendered="sizeToNatural" />
            </div>
            <div class="dg-pane">
              <span class="dg-ttl">after</span>
              <MermaidDiagram :code="afterSrc" :debounce="0" @rendered="sizeToNatural" />
            </div>
          </template>
          <MermaidDiagram v-else :code="source" :debounce="0" @rendered="sizeToNatural" />
        </div>
      </div>
      <DiagramChangeRegister
        v-if="hasRegister && showRegister"
        :nodes="nodeRows"
        :edges="edgeRows"
      />
    </div>

    <div class="status-band">
      <span v-if="full">
        Nodes <span class="add">{{ tally(full.nodes, 'added') }} added</span> ·
        <span class="chg"
          >{{ tally(full.nodes, 'changed') + tally(full.nodes, 'renamed') }} changed</span
        >
        ·
        <span class="del">{{ tally(full.nodes, 'removed') }} removed</span>
      </span>
      <span v-if="full">
        Edges <span class="add">{{ tally(full.edges, 'added') }} added</span> ·
        <span class="del">{{ tally(full.edges, 'removed') }} removed</span>
      </span>
      <span class="band-end">
        <span v-if="hidden" class="dg-hidden">{{ hidden }} unchanged hidden</span>
      </span>
    </div>
  </div>
</template>

<style scoped src="./styles/DiagramDiffViewer.css"></style>
