<script setup>
// One tool row. Same anatomy as a snippet row — star, type badge, name, meta —
// so the sidebar keeps a single left rail across all four sections. A tool has
// no language, so the badge holds its icon instead of a monogram.
import { useCommands } from '../../../composables/useCommands'
import { shaped } from '../../../utils/props'
import AppIcon from '../../../components/AppIcon.vue'
import { useToolsStore } from '../toolsStore'

defineProps({
  /** @type {import('vue').PropType<import('../../../types').ToolRow>} */
  tool: { type: Object, required: true, validator: shaped('id', 'name', 'icon', 'kind', 'action') }
})

const store = useToolsStore()
const { run } = useCommands()
</script>

<template>
  <li class="row" :class="{ pinned: tool.pinned }">
    <button
      class="star"
      :class="{ on: tool.pinned }"
      :data-tip="tool.pinned ? 'Unpin' : 'Pin to the top of the list'"
      :aria-label="tool.pinned ? `Unpin ${tool.name}` : `Pin ${tool.name} to the top`"
      :aria-pressed="tool.pinned"
      @click="store.togglePin(tool.id)"
    >
      <AppIcon :name="tool.pinned ? 'star-filled' : 'star'" />
    </button>

    <button class="entry" :data-tip="`${tool.kind} — ${tool.name}`" @click="run(tool.action)">
      <span class="monogram glyph"><AppIcon :name="tool.icon" /></span>
      <span class="nm">{{ tool.name }}</span>
    </button>

    <span class="kind">{{ tool.kind }}</span>
  </li>
</template>

<style scoped src="./styles/ToolRow.css"></style>
