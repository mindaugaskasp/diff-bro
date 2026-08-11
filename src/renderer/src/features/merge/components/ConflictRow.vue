<script setup>
// One conflicted file. State is encoded three ways — the stripe, the icon and
// the word — so it survives greyscale and every colour-vision deficiency.
import { computed } from 'vue'
import AppIcon from '../../../components/AppIcon.vue'
import { shaped } from '../../../utils/props'

const props = defineProps({
  /** @type {import('../../../types').ConflictRowData} */
  row: {
    type: Object,
    required: true,
    validator: shaped('name', 'dir', 'tally', 'state')
  },
  selected: { type: Boolean, default: false },
  busy: { type: Boolean, default: false }
})
defineEmits(['pick', 'take'])

const ICONS = { open: 'git-merge', done: 'check', blocked: 'binary' }

const icon = computed(() => ICONS[props.row.state] ?? 'git-merge')
const answerable = computed(() => props.row.state !== 'done')
</script>

<template>
  <div
    class="cf-row"
    :class="[row.state, { selected }]"
    role="option"
    :aria-selected="selected"
    :data-testid="`conflict-row-${row.name}`"
    @click="$emit('pick')"
  >
    <i class="cf-stripe" aria-hidden="true"></i>
    <AppIcon :name="icon" class="cf-icon" />
    <span class="cf-name">{{ row.name }}</span>
    <span class="cf-dir">{{ row.dir || $t('merge.repoRoot') }}</span>
    <span class="cf-state">
      <template v-if="row.state === 'done'">{{ $t('merge.rowResolved') }}</template>
      <template v-else-if="row.state === 'blocked'">{{ $t('merge.rowBlocked') }}</template>
      <template v-else>{{ $t('merge.rowConflicts', row.tally) }}</template>
    </span>
    <span v-if="answerable" class="cf-take">
      <button
        class="btn btn-sm"
        :disabled="busy"
        :data-testid="`conflict-ours-${row.name}`"
        @click.stop="$emit('take', 'ours')"
      >
        {{ $t('merge.takeOurs') }}
      </button>
      <button
        class="btn btn-sm"
        :disabled="busy"
        :data-testid="`conflict-theirs-${row.name}`"
        @click.stop="$emit('take', 'theirs')"
      >
        {{ $t('merge.takeTheirs') }}
      </button>
    </span>
  </div>
</template>

<style scoped src="./styles/ConflictRow.css"></style>
