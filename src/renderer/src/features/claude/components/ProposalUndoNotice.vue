<script setup>
// The one way back from an accept or discard (#121), until the proposal leaves the inbox.
import { computed } from 'vue'
import { useClaudeStore } from '../claudeStore'

const claude = useClaudeStore()
const KEYS = {
  accepted: ['claude.undo.acceptedOne', 'claude.undo.acceptedMany'],
  discarded: ['claude.undo.discardedOne', 'claude.undo.discardedMany']
}
const message = computed(() => {
  const u = claude.undoable
  if (!u) return null
  return { key: KEYS[u.verb][u.n === 1 ? 0 : 1], params: { name: u.name, n: u.n } }
})
</script>

<template>
  <div v-if="message" class="notice proposal-undo" role="status">
    <span>{{ $t(message.key, message.params) }}</span>
    <button type="button" class="btn btn-sm" @click="claude.undo()">
      {{ $t('claude.undo.undo') }}
    </button>
  </div>
</template>
