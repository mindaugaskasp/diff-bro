<script setup>
// The comparison tab strip. Only the active tab owns Monaco models — every
// other tab is the snapshot it will be restored from (see tabsStore).
//
// A tab is a ROW holding two buttons, never a button inside a button: nesting
// them is invalid markup and leaves the close control unreachable to keyboard
// and assistive tech, which is how it was first written.
import { nextTick, ref, watch } from 'vue'
import { useTabsStore } from '../stores/tabsStore'
import { MAX_TAB_NAME, isBlank, tabLabel } from '../utils/tabs'
import { useDiffStore } from '../stores/diffStore'
import AppIcon from './AppIcon.vue'
import { MOD } from '../keys'

const tabs = useTabsStore()
const diff = useDiffStore()

// The label follows the live comparison, so a tab stops saying "Untitled" the
// moment a file lands in it.
watch(
  () => [diff.left, diff.right, diff.mode, diff.pasteLeftFile, diff.pasteRightFile, diff.pasteLeft],
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

// A tab with content that was never saved: closing it is the only way to lose
// paste-mode text, so it asks first. Asked of the SNAPSHOT, never of the label —
// matching on display text meant renaming the empty tab silently stopped it
// confirming.
function requestClose(tab) {
  if (!tab.diffSaved && !isBlank(tab)) diff.pendingTabClose = tab.id
  else tabs.close(tab.id)
}
</script>

<template>
  <div v-if="tabs.visible" class="diff-tabs band" role="tablist" aria-label="Open comparisons">
    <div
      v-for="tab in tabs.tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: tab.id === tabs.activeId }"
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
        @auxclick.middle.prevent="requestClose(tab)"
      >
        <span v-if="!tab.diffSaved" class="dirty" aria-hidden="true"></span>
        <span class="name">{{ tabLabel(tab) }}</span>
      </button>
      <button
        v-if="tabs.tabs.length > 1"
        class="tab-close"
        :aria-label="`Close ${tabLabel(tab)}`"
        @click="requestClose(tab)"
      >
        <AppIcon name="x" />
      </button>
    </div>
    <button
      class="add"
      :disabled="!tabs.canAdd"
      :data-tip="
        tabs.canAdd ? `New comparison (${MOD}+Shift+T)` : 'That is the most comparisons at once'
      "
      aria-label="New comparison"
      @click="tabs.newTab()"
    >
      <AppIcon name="plus" />
    </button>
  </div>
</template>

<style scoped src="./styles/DiffTabBar.css"></style>
