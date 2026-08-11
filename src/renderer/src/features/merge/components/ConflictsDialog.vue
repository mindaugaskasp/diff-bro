<script setup>
// The files git is still calling conflicted, in front of the merge rather than
// behind it. Picking a row opens the three-way view; Ours / Theirs answer a
// whole file from the index without opening anything.
import { computed } from 'vue'
import BaseDialog from '../../../components/BaseDialog.vue'
import ConflictRow from './ConflictRow.vue'
import { useConflictsStore } from '../conflictsStore'
import { useMergeStore } from '../mergeStore'

const conflicts = useConflictsStore()
const merge = useMergeStore()

const tally = computed(() => ({ n: conflicts.rows.length, done: conflicts.done }))
const canResolve = computed(() => conflicts.current?.state === 'open')

// Named literally rather than built from the store's value: a template key the
// extractor cannot see is a key that ships untranslated.
const ERROR_KEYS = {
  gone: 'merge.error.gone',
  'take-failed': 'merge.error.take-failed',
  blocked: 'merge.error.blocked'
}
const errorKey = computed(() => ERROR_KEYS[conflicts.error] ?? '')

async function openRow(index) {
  conflicts.select(index)
  if (conflicts.rows[index]?.state !== 'open') return
  const payload = await conflicts.payloadAt(index)
  if (!payload) return
  merge.begin(payload)
  conflicts.hide()
}

// Answering the row for the file GIT asked about releases that launch in main,
// so the view behind this dialog is showing a merge that is over.
const takeRow = async (index, side) => {
  conflicts.select(index)
  if (await conflicts.take(index, side)) merge.dismiss()
}
</script>

<template>
  <BaseDialog
    width="720px"
    :title="$t('merge.conflictsTitle')"
    data-testid="conflicts-dialog"
    @close="conflicts.dismiss()"
  >
    <div class="cf-band band">
      <span class="cf-tally">
        <i18n-t keypath="merge.filesResolved" tag="span">
          <template #files>
            <b>{{ $t('merge.fileCount', tally.n) }}</b>
          </template>
          <template #done>{{ tally.done }}</template>
        </i18n-t>
      </span>
      <span v-if="merge.oursName && merge.theirsName" class="cf-revs">
        {{ merge.oursName }} &#8592; {{ merge.theirsName }}
      </span>
    </div>

    <p v-if="errorKey" class="dialog-note" data-testid="conflicts-error">{{ $t(errorKey) }}</p>

    <div class="cf-well" role="listbox" :aria-label="$t('merge.conflictsTitle')">
      <ConflictRow
        v-for="(row, i) in conflicts.rows"
        :key="`${row.dir}/${row.name}`"
        :row="row"
        :selected="i === conflicts.at"
        :busy="conflicts.busy"
        @pick="openRow(i)"
        @take="takeRow(i, $event)"
      />
    </div>

    <template #actions>
      <span class="cf-hint">{{ $t('merge.listHint') }}</span>
      <button class="btn btn-ghost" data-testid="conflicts-close" @click="conflicts.dismiss()">
        {{ $t('common.close') }}
      </button>
      <button
        class="btn btn-primary"
        :disabled="!canResolve"
        data-testid="conflicts-resolve"
        @click="openRow(conflicts.at)"
      >
        {{ $t('merge.resolveRow') }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/ConflictsDialog.css"></style>
