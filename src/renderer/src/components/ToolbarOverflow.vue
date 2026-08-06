<script setup>
// The document actions, and the menu whatever will not fit folds into. Both are
// drawn from ONE row array (utils/toolbarActions), so a folded action can never
// say something different from its inline twin.
//
// Three rungs, never two: labelled, then icon-only, then folded. A control loses
// its word before it loses its place, so the row degrades by getting terser
// rather than by hiding things the moment it is squeezed.
//
// The label is on `aria-label` at every rung, so the accessible name is the same
// whether the word is drawn or not.
import { computed, ref, watch } from 'vue'
import { MOD } from '../keys'
import { useSettingsStore } from '../stores/settingsStore'
import { useCommands } from '../composables/useCommands'
import { usePopover } from '../composables/usePopover'
import { useToolbarOverflow } from '../composables/useToolbarOverflow'
import { FOLD_ORDER, toolbarActions } from '../utils/toolbarActions'
import { shaped } from '../utils/props'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  /** @type {import('../types').ToolbarState} */
  state: {
    type: Object,
    required: true,
    validator: shaped('isStreamed', 'hasUnsavedWork', 'canSave', 'ready', 'comparableKind')
  }
})

const { run } = useCommands()
const settings = useSettingsStore()
const group = ref(null)
// The scrolling row this group shares with the View menu — its clientWidth is
// the budget. Read off the DOM rather than passed in: the relationship is
// structural, and a prop carrying an element is a worse API than a lookup.
const host = computed(() => group.value?.closest('.options') ?? null)

const rows = computed(() => toolbarActions(props.state))
// A re-measure is needed when the row SET or the WORDS in it change, not on
// every state tick. The locale is part of that and cannot be left out: a
// language switch changes what every control measures without changing the size
// of the row it sits in, so the ResizeObserver never fires. Keyed on labelKey
// alone the bar kept its English widths and overflowed by 145px in en-XA.
const signature = computed(
  () => `${settings.activeLocale}|${rows.value.map((r) => `${r.id}:${r.labelKey}`).join('|')}`
)

const { folded, compact } = useToolbarOverflow(
  { host, group },
  { rows: () => rows.value, order: () => FOLD_ORDER, signature }
)

const shown = computed(() => rows.value.filter((r) => !folded.value.includes(r.id)))
const hidden = computed(() => rows.value.filter((r) => folded.value.includes(r.id)))

const { open, toggle, onKeydown, backdrop, close } = usePopover()

// The anchor is `v-if="hidden.length"`, and the backdrop is teleported to body
// under `v-if="open"`. Widening the window while the menu is open unfolds
// everything and unmounts the anchor — which took the panel and the Escape
// handler with it and left a full-window backdrop in the document, eating the
// next click anywhere in the app with no way to dismiss it.
watch(
  () => hidden.value.length,
  (n) => !n && close()
)

function activate(id) {
  close()
  run(id)
}
</script>

<template>
  <div ref="group" class="group actions">
    <button
      v-for="row in shown"
      :key="row.id"
      class="btn"
      :class="{ 'btn-primary': row.id === 'save', 'btn-square': compact, active: row.active }"
      :data-action="row.id"
      :data-tour="row.id === 'share-current' ? 'share' : undefined"
      :data-tip="$t(row.tipKey, { mod: MOD })"
      :aria-label="$t(row.labelKey)"
      :disabled="row.disabled"
      @click="run(row.id)"
    >
      <AppIcon :name="row.icon" />
      <template v-if="!compact">{{ $t(row.labelKey) }}</template>
    </button>

    <span v-if="hidden.length" class="anchor" @keydown="onKeydown">
      <button
        class="btn btn-square"
        :class="{ active: open }"
        :aria-expanded="open"
        aria-haspopup="true"
        :data-tip="$t('appToolbar.tips.more')"
        :aria-label="$t('appToolbar.more')"
        @click="toggle"
      >
        <AppIcon name="more-horizontal" />
      </button>
      <div v-if="open" class="popover" role="menu">
        <button
          v-for="row in hidden"
          :key="row.id"
          class="popover-row"
          role="menuitem"
          :disabled="row.disabled"
          @click="activate(row.id)"
        >
          <AppIcon :name="row.icon" />
          {{ $t(row.labelKey) }}
        </button>
      </div>
    </span>
  </div>
  <Teleport to="body">
    <div
      v-if="open"
      class="popover-backdrop"
      @pointerdown="backdrop.onPointerDown"
      @click="backdrop.onClick"
    />
  </Teleport>
</template>

<style scoped src="./styles/ToolbarOverflow.css"></style>
