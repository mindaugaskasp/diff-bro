<script setup>
// The sidebar collapsed to a strip. Nothing is removed, only abbreviated: every
// section is still here with its count, and opens the sidebar on the way to
// what was asked for. Expanding has its own control, so it never means picking
// a section you did not want.
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useSnippetStore } from '../stores/snippetStore'
import AppIcon from './AppIcon.vue'

const emit = defineEmits(['expand'])
const vault = useVaultStore()
const snippets = useSnippetStore()

const groups = computed(() => [
  {
    id: 'saved',
    icon: 'folder',
    label: 'Saved diffs',
    count: vault.active.filter((e) => !e.from).length
  },
  { id: 'shared', icon: 'share', label: 'External diffs', count: vault.importedActive.length },
  { id: 'snippets', icon: 'code', label: 'Snippets', count: snippets.entries.length }
])
</script>

<template>
  <div class="rail">
    <div class="rail-band band">
      <button
        class="rail-btn"
        data-tip="Search diffs & snippets"
        aria-label="Search diffs and snippets"
        @click="emit('expand', 'search')"
      >
        <AppIcon name="search" />
      </button>
    </div>

    <button
      v-for="g in groups"
      :key="g.id"
      class="rail-btn"
      :data-tip="`${g.label} (${g.count})`"
      :aria-label="`${g.label}, ${g.count}`"
      @click="emit('expand', g.id)"
    >
      <AppIcon :name="g.icon" />
      <span v-if="g.count" class="rail-count">{{ g.count > 99 ? '99+' : g.count }}</span>
    </button>

    <div class="rail-gap"></div>

    <button
      class="rail-btn rail-expand"
      data-tip="Expand the sidebar"
      aria-label="Expand the sidebar"
      @click="emit('expand', null)"
    >
      <AppIcon name="chevron-right" />
    </button>

    <button class="rail-btn" data-tip="Tools" aria-label="Tools" @click="emit('expand', 'tools')">
      <AppIcon name="wrench" />
    </button>
  </div>
</template>

<style scoped src="./styles/SidebarRail.css"></style>
