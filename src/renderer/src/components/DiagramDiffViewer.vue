<script setup>
import { ref, watch } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { modelFrom } from '../utils/diagramModel'
import { diffDiagrams } from '../utils/diagramDiff'
import { unionSource } from '../utils/diagramUnion'
import { focusDiff } from '../utils/diagramFocus'
import MermaidDiagram from './MermaidDiagram.vue'
import DiagramChangeRegister from './DiagramChangeRegister.vue'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()
const focused = ref(false)
const radius = ref(1)
const source = ref('')
const error = ref('')
const counts = ref(null)
const hidden = ref(0)
const rows = ref([])
// Only the newest build may write: two model parses are awaited, so a slower
// earlier run can resolve after a newer one and leave the picture showing one
// revision while the register shows another. Same guard MermaidDiagram carries.
let buildSeq = 0

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
  const full = diffDiagrams(a, b)
  const shown = focused.value ? focusDiff(full, radius.value) : { ...full, hidden: 0 }
  counts.value = full.counts
  hidden.value = shown.hidden
  rows.value = [...full.nodes, ...full.edges].filter((x) => x.status !== 'same')
  source.value = unionSource(shown, b.type)
}

watch(
  () => [
    store.left?.content,
    store.right?.content,
    focused.value,
    radius.value,
    store.diffRevision
  ],
  build,
  { immediate: true }
)
</script>

<template>
  <div class="dgv">
    <div class="dg-legend band band-row">
      <span class="dg-key"><i class="sw add"></i>added</span>
      <span class="dg-key"><i class="sw del"></i>removed</span>
      <span class="dg-key"><i class="sw chg"></i>changed</span>
      <span class="dg-spacer"></span>
      <button class="btn btn-sm" :aria-pressed="focused" @click="focused = !focused">
        <AppIcon name="diagram" />{{ focused ? 'Whole diagram' : 'Focus changes' }}
      </button>
      <label v-if="focused" class="dg-radius">
        context
        <select v-model.number="radius">
          <option :value="0">0</option>
          <option :value="1">1</option>
          <option :value="2">2</option>
        </select>
      </label>
    </div>

    <div class="dg-stage">
      <p v-if="error" class="dg-error">{{ error }}</p>
      <MermaidDiagram v-else :code="source" :debounce="0" />
    </div>

    <div class="dg-status band band-row">
      <span v-if="counts" class="dg-counts">
        <b class="add">+{{ counts.added }}</b>
        <b class="del">−{{ counts.removed }}</b>
        <b class="chg">±{{ counts.changed + counts.renamed }}</b>
      </span>
      <span v-if="hidden" class="dg-hidden">{{ hidden }} unchanged hidden</span>
      <span class="dg-spacer"></span>
      <span class="dg-type">{{ rows.length }} change{{ rows.length === 1 ? '' : 's' }}</span>
    </div>

    <DiagramChangeRegister v-if="rows.length" :rows="rows" />
  </div>
</template>

<style scoped src="./styles/DiagramDiffViewer.css"></style>
