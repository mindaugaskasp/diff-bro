<script setup>
// The comparison tab strip. Only the active tab owns Monaco models — every
// other tab is the snapshot it will be restored from (see tabsStore).
//
// A tab is a ROW holding two buttons, never a button inside a button: nesting
// them is invalid markup and leaves the close control unreachable to keyboard
// and assistive tech, which is how it was first written.
import { nextTick, ref, watch } from 'vue'
import { useTabsStore } from '../stores/tabsStore'
import { MAX_TABS, MAX_TAB_NAME, tabLabel } from '../utils/tabs'
import { useDiffStore } from '../stores/diffStore'
import AppIcon from './AppIcon.vue'
import TabContextMenu from './TabContextMenu.vue'
import { useTabContextMenu } from '../composables/useTabContextMenu'
import { MOD } from '../keys'

const tabs = useTabsStore()
const diff = useDiffStore()

// The label follows the live comparison, so a tab stops saying "Untitled" the
// moment a file lands in it.
watch(
  () => [
    diff.left,
    diff.right,
    diff.mode,
    diff.pasteLeftFile,
    diff.pasteRightFile,
    diff.pasteLeft,
    diff.pasteRight,
    diff.pasteLeftName,
    diff.pasteRightName
  ],
  () => tabs.syncActiveTitle()
)

// Double-click renames. The draft is held here, not in the tab, so abandoning
// it with Escape leaves the stored name untouched.
const renamingId = ref(null)
const draft = ref('')
const nameInput = ref(null)

function startRename(tab) {
  renamingId.value = tab.id
  draft.value = tabLabel(tab)
  nextTick(() => nameInput.value?.[0]?.select())
}
function commitRename() {
  if (renamingId.value) tabs.rename(renamingId.value, draft.value)
  renamingId.value = null
}

const menu = useTabContextMenu(() => tabs.tabs)
const run = (id, action) => tabs.requestMenuAction(id, action)
function pick(action) {
  const id = menu.anchorId.value
  menu.close()
  run(id, action)
}
// Shift+F10 is the platform's "open the context menu here", so the strip is
// reachable without a pointer.
function onTabKey(e, tab) {
  if (!(e.key === 'F10' && e.shiftKey) && e.key !== 'ContextMenu') return
  e.preventDefault()
  const box = e.currentTarget.getBoundingClientRect()
  menu.show(tab.id, { x: box.left + 8, y: box.bottom }, true)
}
</script>

<template>
  <div v-if="tabs.visible" class="diff-tabs band" role="tablist" aria-label="Open comparisons">
    <div
      v-for="tab in tabs.tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: tab.id === tabs.activeId }"
      @contextmenu.prevent="menu.show(tab.id, { x: $event.clientX, y: $event.clientY })"
    >
      <input
        v-if="renamingId === tab.id"
        ref="nameInput"
        v-model="draft"
        class="tab-rename"
        type="text"
        spellcheck="false"
        :maxlength="MAX_TAB_NAME"
        :aria-label="`Rename ${tabLabel(tab)}`"
        @keyup.enter="commitRename"
        @keyup.escape="renamingId = null"
        @blur="commitRename"
      />
      <button
        v-else
        class="tab-open"
        role="tab"
        :aria-selected="tab.id === tabs.activeId"
        :data-tip="`${tabLabel(tab)} — double-click to rename`"
        @click="tabs.activate(tab.id)"
        @dblclick="startRename(tab)"
        @auxclick.middle.prevent="tabs.requestClose(tab.id)"
        @keydown="onTabKey($event, tab)"
      >
        <span v-if="tabs.unsaved(tab)" class="dirty" aria-hidden="true"></span>
        <span class="name">{{ tabLabel(tab) }}</span>
      </button>
      <button
        v-if="tabs.tabs.length > 1"
        class="tab-close"
        :aria-label="`Close ${tabLabel(tab)}`"
        @click="tabs.requestClose(tab.id)"
      >
        <AppIcon name="x" />
      </button>
    </div>
    <button
      class="add"
      :disabled="!tabs.canAdd"
      :data-tip="
        tabs.canAdd
          ? `New comparison (${MOD}+Shift+T)`
          : `That is the most comparisons at once (${MAX_TABS})`
      "
      aria-label="New comparison"
      @click="tabs.newTab()"
    >
      <AppIcon name="plus" />
    </button>

    <TabContextMenu
      v-if="menu.open.value"
      :at="menu.at.value"
      :items="menu.items.value"
      :cursor="menu.cursor.value"
      @pick="pick"
      @hover="menu.cursor.value = $event"
      @key="menu.keyHandler(run)($event)"
      @close="menu.close()"
    />
  </div>
</template>

<style scoped src="./styles/DiffTabBar.css"></style>
