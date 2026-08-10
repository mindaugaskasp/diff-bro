<script setup>
// Resolving a merge the way a merge is read: the two commits either side, the
// file you are producing in the middle, and that middle one is yours to type in.
import { onMounted, ref } from 'vue'
import { useMergeStore } from '../mergeStore'
import { useMergePanes } from '../useMergePanes'
import { useMergePaneSizes } from '../useMergePaneSizes'
import { useMergeKeys } from '../useMergeKeys'
import MergeActions from './MergeActions.vue'
import AppIcon from '../../../components/AppIcon.vue'

const merge = useMergeStore()
const sizes = useMergePaneSizes()
const oursEl = ref(null)
const resultEl = ref(null)
const theirsEl = ref(null)
const { create, reveal, take, takeAll } = useMergePanes(
  { ours: oursEl, result: resultEl, theirs: theirsEl },
  merge
)

onMounted(create)

const go = (delta) => {
  merge.step(delta)
  reveal(merge.at)
}
const answer = (choice) => {
  take(merge.at, choice)
  reveal(merge.at)
}
useMergeKeys(go)
</script>

<template>
  <div class="merge-view">
    <div class="merge-bar band">
      <AppIcon name="git-merge" />
      <span class="merge-file">{{ merge.fileName }}</span>
      <!-- git walks the conflicted files one launch at a time, so without this
           there is no telling the third of thirty from the last. -->
      <span v-if="merge.showsWalk" class="merge-walk" data-testid="merge-walk">
        {{ $t('merge.fileOf', { n: merge.position, total: merge.total }) }}
      </span>
      <MergeActions
        :remaining="merge.remaining"
        :disabled="!merge.regions.length"
        @step="go"
        @take="answer"
        @all="takeAll"
      />
      <span class="merge-end">
        <button class="btn btn-sm" @click="merge.close()">{{ $t('common.cancel') }}</button>
        <button
          class="btn btn-sm btn-primary"
          data-testid="merge-save"
          :disabled="!merge.canSave"
          @click="merge.save()"
        >
          {{ $t('merge.save') }}
        </button>
      </span>
    </div>

    <p v-if="merge.error" class="merge-note">{{ $t('merge.unreadable') }}</p>

    <div
      class="merge-panes"
      :class="{ resizing: sizes.resizing.value }"
      :style="{ gridTemplateColumns: sizes.columns.value }"
    >
      <section class="merge-pane">
        <header class="merge-head band">
          {{ $t('merge.ours') }}
          <!-- Which commit a side IS, when git can say. A rebase writes no
               MERGE_HEAD, so both come back empty rather than naming the wrong
               branch. -->
          <span v-if="merge.oursName" class="merge-rev">
            {{ $t('merge.fromBranch', { name: merge.oursName }) }}
          </span>
        </header>
        <div ref="oursEl" class="merge-editor"></div>
      </section>
      <div class="merge-grip" @pointerdown="sizes.start('ours', $event)"></div>
      <section class="merge-pane result">
        <header class="merge-head band">
          {{ $t('merge.result') }}
          <span class="merge-hint">{{ $t('merge.editable') }}</span>
        </header>
        <div ref="resultEl" class="merge-editor"></div>
      </section>
      <div class="merge-grip" @pointerdown="sizes.start('result', $event)"></div>
      <section class="merge-pane">
        <header class="merge-head band">
          {{ $t('merge.theirs') }}
          <span v-if="merge.theirsName" class="merge-rev">
            {{ $t('merge.fromBranch', { name: merge.theirsName }) }}
          </span>
        </header>
        <div ref="theirsEl" class="merge-editor"></div>
      </section>
    </div>
  </div>
</template>

<style scoped src="./styles/MergeView.css"></style>
