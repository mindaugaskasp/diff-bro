<script setup>
// A ⌘K-style palette over every menu command. The command list comes from the
// same buildMenus() the menu bar uses (flattened, no duplication); matching is
// the shared rank(), and the keyboard driver is useQuickLookKeys with its
// list-only defaults — so all the event logic stays in tested composables.
import { computed, onMounted, ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { buildMenus } from '../menus'
import { useCommands } from '../composables/useCommands'
import { flattenCommands } from '../utils/commandPalette'
import { TOOLS, namedTools, toolPaletteItems } from '../utils/tools'
import { t } from '../i18n'
import { rank } from '../utils/quickLook'
import { useQuickLookKeys } from '../composables/useQuickLookKeys'
import { useBackdropClose } from '../composables/useBackdropClose'
import AppIcon from './AppIcon.vue'
import { useUiStore } from '../stores/uiStore'

const ui = useUiStore()
const settings = useSettingsStore()
const { runFromMenu: run } = useCommands()
const commands = flattenCommands(buildMenus(run))
const query = ref('')
const selected = ref(0)
const input = ref(null)
const listEl = ref(null)

const isTools = computed(() => ui.paletteScope === 'tools')
// Unfiltered, the tools scope shows Recent above All tools; once you type it
// ranks the plain registry so a recent tool can't match twice.
const results = computed(() => {
  if (!isTools.value) return rank(query.value, commands)
  // Translated first: rank() searches `name`, so ranking the raw registry would
  // match against catalogue keys instead of what the user can see.
  const named = (rows) => namedTools(rows, t)
  return query.value.trim()
    ? rank(query.value, named(TOOLS))
    : named(toolPaletteItems(settings.recentTools)).map((row) => ({
        ...row,
        section: row.sectionKey ? t(row.sectionKey) : ''
      }))
})
watch(results, () => (selected.value = 0))
watch(selected, (i) => listEl.value?.children?.[i]?.scrollIntoView({ block: 'nearest' }))

function close() {
  ui.showCommandPalette = false
}
function choose(i) {
  const cmd = results.value[i]
  if (!cmd) return
  close()
  if (cmd.action) run(cmd.action)
  else cmd.run()
}

const { onKeydown } = useQuickLookKeys({
  count: () => results.value.length,
  selected,
  onChoose: choose,
  onDismiss: close
})
const { onPointerDown, onClick } = useBackdropClose(close)

onMounted(() => input.value?.focus())
</script>

<template>
  <div class="cp-backdrop" @pointerdown="onPointerDown" @click="onClick">
    <div class="cp" role="dialog" :aria-label="$t('commandPalette.commandPalette')">
      <div class="cp-search">
        <AppIcon name="search" class="cp-ico" />
        <input
          ref="input"
          v-model="query"
          class="cp-input"
          type="text"
          :placeholder="isTools ? $t('palette.searchTools') : $t('palette.searchCommands')"
          autocomplete="off"
          spellcheck="false"
          @keydown="onKeydown"
        />
        <span class="cp-kbd">{{ $t('commandPalette.esc') }}</span>
      </div>
      <ul ref="listEl" class="cp-list">
        <li v-if="!results.length" class="cp-empty">
          {{ isTools ? $t('palette.noTool') : $t('palette.noCommand') }}
        </li>
        <li
          v-for="(cmd, i) in results"
          :key="(cmd.group || cmd.id) + cmd.name"
          class="cp-row"
          :class="{ sel: i === selected, tool: isTools }"
          :data-section="cmd.section || undefined"
          @mouseenter="selected = i"
          @click="choose(i)"
        >
          <AppIcon v-if="isTools" :name="cmd.icon" class="cp-tool-ico" />
          <span v-else class="cp-group">{{ cmd.group }}</span>
          <span class="cp-name">{{ cmd.name }}</span>
          <span v-if="cmd.keys" class="cp-keys">{{ cmd.keys }}</span>
          <span v-else-if="isTools" class="cp-kind">{{ cmd.kind }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped src="./styles/CommandPalette.css"></style>
