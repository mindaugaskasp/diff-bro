<script setup>
// Two panes of fixed-height rows over one scroll box, for files too large to
// hold in an editor model. Every row is exactly ROW_HEIGHT tall — the spacers
// that stand in for the unrendered millions are computed from it, so a row of
// any other height makes them lie and the list jumps.
import { computed, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useStreamedDiff } from '../composables/useStreamedDiff'
import { useCaptureRegion } from '../composables/useCaptureRegion'
import AppIcon from './AppIcon.vue'
import StreamedMarker from './StreamedMarker.vue'

const store = useDiffStore()
const box = ref(null)
const { rows, window: view, rowHeight, total, summary, error, loading } = useStreamedDiff(box)

useCaptureRegion(box)

const rowStyle = computed(() => ({ height: `${rowHeight}px` }))
const identical = computed(
  () => !!summary.value && summary.value.additions === 0 && summary.value.deletions === 0
)
const message = computed(() => {
  if (error.value === 'not-permitted') return 'These files can no longer be read.'
  if (error.value) return 'This comparison could not be read from disk.'
  if (!store.streamedPairReady) {
    return 'A file this large can only be compared with another file — not with pasted text.'
  }
  return null
})
const lineLabel = (line) => (line === null ? '' : line + 1)
// The left pane shows what went, the right what came; a side with no
// counterpart is a striped gap so the two stay row-for-row aligned.
const leftClass = (row) => (row.leftLine === null ? 'ghost' : row.status === 'same' ? '' : 'del')
const rightClass = (row) => (row.rightLine === null ? 'ghost' : row.status === 'same' ? '' : 'add')
</script>

<template>
  <div class="stream-viewer">
    <StreamedMarker :summary="summary" :loading="loading" />

    <div v-if="message" class="stream-empty">{{ message }}</div>
    <div v-else-if="loading" class="stream-empty">{{ $t('streamedDiffViewer.indexing') }}</div>
    <template v-else>
      <div v-if="identical" class="identical-row">
        <AppIcon name="check" class="ok" />
        <span>{{ $t('streamedDiffViewer.noDifferencesBothSidesAre') }}</span>
      </div>

      <div ref="box" class="stream-rows">
        <div class="stream-spacer" :style="{ height: `${view.padTop}px` }"></div>
        <div v-for="(row, i) in rows" :key="view.start + i" class="srow" :style="rowStyle">
          <span class="ln">{{ lineLabel(row.leftLine) }}</span>
          <span class="txt" :class="leftClass(row)">{{ row.leftText }}</span>
          <span class="ln mid">{{ lineLabel(row.rightLine) }}</span>
          <span class="txt" :class="rightClass(row)">{{ row.rightText }}</span>
        </div>
        <div class="stream-spacer" :style="{ height: `${view.padBottom}px` }"></div>
      </div>

      <div class="status-band">
        <span>
          {{ $t('streamedDiffViewer.lines') }}
          <span class="add">{{ summary?.additions ?? 0 }} added</span> ·
          <span class="del">{{ summary?.deletions ?? 0 }} removed</span>
        </span>
        <span>{{ total.toLocaleString() }} rows</span>
        <span v-if="summary?.approximate" class="capped">
          alignment is a best fit — the files differ too widely to match line for line
        </span>
        <span class="band-end">
          {{ (summary?.leftLines ?? 0).toLocaleString() }} ↔
          {{ (summary?.rightLines ?? 0).toLocaleString() }} lines
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped src="./styles/StreamedDiffViewer.css"></style>
