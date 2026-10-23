<script setup>
import { computed } from 'vue'
import { useCommands } from '../../../composables/useCommands'
import { arrayOfShape } from '../../../utils/props'
import { TOOL_GROUPS } from '../../../utils/toolGroups'
import AppIcon from '../../../components/AppIcon.vue'
import { useToolsStore } from '../toolsStore'

const props = defineProps({
  /** @type {import('vue').PropType<import('../../../types').ToolRow[]>} */
  tools: { type: Array, required: true, validator: arrayOfShape('id', 'name', 'icon', 'action') }
})

const store = useToolsStore()
const { run } = useCommands()

const groups = computed(() =>
  TOOL_GROUPS.map((group) => ({
    ...group,
    tools: props.tools.filter((tool) => group.ids.includes(tool.id))
  })).filter((group) => group.tools.length)
)
</script>

<template>
  <div class="tool-tiles">
    <p v-if="!groups.length" class="tt-empty">{{ $t('tools.section.noToolsMatchTryRemoving') }}</p>
    <section v-for="group in groups" :key="group.hue" class="tt-group">
      <h3 class="tt-head">
        <span class="tt-dot glyph-well" :data-hue="group.hue" aria-hidden="true"></span>
        {{ $t(group.labelKey) }}
      </h3>
      <div class="tt-grid">
        <div v-for="tool in group.tools" :key="tool.id" class="tt-cell">
          <button
            type="button"
            class="tile tt-tile"
            :data-tip="tool.descKey ? $t(tool.descKey) : tool.name"
            @click="run(tool.action)"
          >
            <span class="glyph-well" :data-hue="group.hue"><AppIcon :name="tool.icon" /></span>
            <span class="row-2-name tt-name">{{ tool.name }}</span>
          </button>
          <button
            type="button"
            class="tt-pin"
            :class="{ on: tool.pinned }"
            :aria-pressed="tool.pinned"
            :aria-label="
              tool.pinned
                ? $t('toolRow.unpin', { name: tool.name })
                : $t('toolRow.pin', { name: tool.name })
            "
            @click="store.togglePin(tool.id)"
          >
            <AppIcon :name="tool.pinned ? 'star-filled' : 'star'" />
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped src="./styles/ToolTiles.css"></style>
