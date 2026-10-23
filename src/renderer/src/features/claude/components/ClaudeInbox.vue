<script setup>
import { useClaudeStore } from '../claudeStore'
import AppIcon from '../../../components/AppIcon.vue'
import { ago } from '../../../utils/relativeTime'

const claude = useClaudeStore()

const KIND_KEY = {
  snippet: 'claude.inbox.kind.snippet',
  comparison: 'claude.inbox.kind.comparison'
}
</script>

<template>
  <ul class="inbox">
    <li v-for="p in claude.inbox" :key="p.id" class="inbox-item">
      <div class="row-2">
        <span class="glyph-well" data-hue="received">
          <AppIcon :name="p.kind === 'snippet' ? 'code' : 'diff'" />
        </span>
        <span class="row-2-text">
          <span class="row-2-name">{{ p.name }}</span>
          <span class="row-2-meta">{{ $t(KIND_KEY[p.kind]) }} · {{ ago(p.createdAt) }}</span>
        </span>
      </div>
      <p v-if="p.note" class="inbox-note">{{ p.note }}</p>
      <div class="inbox-actions">
        <button type="button" class="btn btn-sm" @click="claude.preview(p.id)">
          {{ $t('claude.inbox.preview') }}
        </button>
        <button type="button" class="btn btn-sm btn-primary" @click="claude.accept(p.id)">
          {{ $t('claude.inbox.accept') }}
        </button>
        <button
          type="button"
          class="btn btn-sm btn-icon"
          :aria-label="$t('claude.inbox.discard')"
          :title="$t('claude.inbox.discard')"
          @click="claude.discard(p.id)"
        >
          <AppIcon name="x" />
        </button>
      </div>
    </li>
  </ul>
</template>

<style scoped src="./styles/ClaudeInbox.css"></style>
