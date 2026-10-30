<script setup>
import { computed } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { t } from '../i18n'
import { hasSplitPanes } from '../utils/viewChrome'

const store = useDiffStore()
const isSplit = computed(() => hasSplitPanes(store))
const sides = computed(() => ['left', 'right'].filter((side) => store[side]))
const replaceLabel = (side) =>
  t('paneLabels.replace', { side: t(`common.${side}`), name: store[side].name })
</script>

<template>
  <div class="pane-labels" :class="isSplit ? 'split' : 'joined'">
    <template v-for="(side, i) in sides" :key="side">
      <span v-if="i && !isSplit" class="pane-sep" aria-hidden="true">↔</span>
      <button
        type="button"
        class="pane-label"
        :data-side="side"
        :data-tip="store[side].path || replaceLabel(side)"
        :aria-label="replaceLabel(side)"
        @click="store.pick(side)"
      >
        {{ store[side].name }}
      </button>
    </template>
  </div>
</template>

<style scoped src="./styles/PaneLabels.css"></style>
