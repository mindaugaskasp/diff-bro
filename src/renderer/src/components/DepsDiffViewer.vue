<script setup>
// Dependencies as dependencies: one row per package that moved, what the reader
// asked for first. The lockfile text stays one toggle away — this answers "what
// changed", not "which bytes changed".
import { computed, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useCaptureRegion } from '../composables/useCaptureRegion'
import { diffLocks } from '../utils/lockfile/lockDiff'
import DepsStatusBand from './DepsStatusBand.vue'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()

// Literal key IDs, not a template built at render time: a key assembled from a
// value is invisible to check:i18n and cannot be found when it goes stale.
const STEP_KEYS = {
  major: 'depsDiffViewer.step.major',
  minor: 'depsDiffViewer.step.minor',
  patch: 'depsDiffViewer.step.patch'
}

const result = computed(() => {
  const pair = store.lockPair
  return pair ? diffLocks(pair.left, pair.right) : null
})

// Transitive changes are the bulk of any lockfile move and are rarely what the
// reader came for, so they fold away until asked for.
const showTransitive = ref(false)
const rows = computed(() => {
  const all = result.value?.rows ?? []
  return showTransitive.value || !result.value?.knowsDirect ? all : all.filter((r) => r.direct)
})
const hiddenCount = computed(() => (result.value?.rows.length ?? 0) - rows.value.length)

const list = ref(null)
useCaptureRegion(list)
</script>

<template>
  <div v-if="result" class="deps-diff">
    <div class="deps-bar band">
      <span class="deps-title">{{ $t('depsDiffViewer.packages') }}</span>
      <button
        v-if="hiddenCount"
        class="btn btn-sm"
        data-testid="deps-transitive"
        @click="showTransitive = !showTransitive"
      >
        <AppIcon name="list" />
        {{ $t('depsDiffViewer.showCarried', hiddenCount) }}
      </button>
      <button
        v-else-if="showTransitive && result.knowsDirect"
        class="btn btn-sm"
        data-testid="deps-transitive"
        @click="showTransitive = false"
      >
        <AppIcon name="list" />
        {{ $t('depsDiffViewer.askedForOnly') }}
      </button>
    </div>

    <div v-if="result.identical" class="identical-row">
      <AppIcon name="check" class="ok" />
      <span>{{ $t('depsDiffViewer.noDependencyChanged') }}</span>
    </div>

    <div v-else ref="list" class="deps-rows">
      <div v-for="(row, i) in rows" :key="`${row.name}-${i}`" class="deps-row" :class="row.status">
        <span class="deps-name">{{ row.name }}</span>
        <span v-if="row.direct" class="deps-tag">{{ $t('depsDiffViewer.direct') }}</span>
        <span v-if="row.dev" class="deps-tag">{{ $t('depsDiffViewer.dev') }}</span>
        <span class="deps-move">
          <span v-if="row.from" class="del">{{ row.from }}</span>
          <template v-if="row.from && row.to">&nbsp;→&nbsp;</template>
          <span v-if="row.to" class="add">{{ row.to }}</span>
        </span>
        <span v-if="STEP_KEYS[row.step]" class="deps-step btn-count">
          {{ $t(STEP_KEYS[row.step]) }}
        </span>
        <span v-if="row.licenseChanged" class="deps-license">{{ row.license }}</span>
      </div>
    </div>

    <DepsStatusBand :result="result" />
  </div>
</template>

<style scoped src="./styles/DepsDiffViewer.css"></style>
