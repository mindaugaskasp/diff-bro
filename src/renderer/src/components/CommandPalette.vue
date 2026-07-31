<script setup>
// A ⌘K-style palette over every menu command. The command list comes from the
// same buildMenus() the menu bar uses (flattened, no duplication); matching is
// the shared rank(), and the keyboard driver is useQuickLookKeys with its
// list-only defaults — so all the event logic stays in tested composables.
import { computed, onMounted, ref, watch } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { buildMenus } from '../menus'
import { flattenCommands } from '../utils/commandPalette'
import { rank } from '../utils/quickLook'
import { useQuickLookKeys } from '../composables/useQuickLookKeys'
import { useBackdropClose } from '../composables/useBackdropClose'
import AppIcon from './AppIcon.vue'

const store = useDiffStore()
const commands = flattenCommands(buildMenus(store))
const query = ref('')
const selected = ref(0)
const input = ref(null)
const listEl = ref(null)

const results = computed(() => rank(query.value, commands))
watch(results, () => (selected.value = 0))
watch(selected, (i) => listEl.value?.children?.[i]?.scrollIntoView({ block: 'nearest' }))

function close() {
  store.showCommandPalette = false
}
function choose(i) {
  const cmd = results.value[i]
  if (!cmd) return
  close()
  cmd.run()
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
    <div class="cp" role="dialog" aria-label="Command palette">
      <div class="cp-search">
        <AppIcon name="search" class="cp-ico" />
        <input
          ref="input"
          v-model="query"
          class="cp-input"
          type="text"
          placeholder="Search commands…"
          autocomplete="off"
          spellcheck="false"
          @keydown="onKeydown"
        />
        <span class="cp-kbd">Esc</span>
      </div>
      <ul ref="listEl" class="cp-list">
        <li v-if="!results.length" class="cp-empty">No matching command.</li>
        <li
          v-for="(cmd, i) in results"
          :key="cmd.group + cmd.name"
          class="cp-row"
          :class="{ sel: i === selected }"
          @mouseenter="selected = i"
          @click="choose(i)"
        >
          <span class="cp-group">{{ cmd.group }}</span>
          <span class="cp-name">{{ cmd.name }}</span>
          <span v-if="cmd.keys" class="cp-keys">{{ cmd.keys }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped src="./styles/CommandPalette.css"></style>
