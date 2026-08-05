<script setup>
// Help → Keyboard Shortcuts: the grouped list (labels from utils/shortcuts.js).
import { computed } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { SHORTCUT_GROUPS } from '../utils/shortcuts'
import { acceleratorLabel } from '../utils/accelerator'
import { isMac } from '../keys'
import BaseDialog from './BaseDialog.vue'
import { useUiStore } from '../stores/uiStore'

const ui = useUiStore()
const settings = useSettingsStore()
const platform = isMac ? 'macOS' : 'this system'

// The quick look-up binding is user-configurable (Settings → Shortcuts), so it's
// appended to the View group live rather than hard-coded in SHORTCUT_GROUPS.
const groups = computed(() =>
  SHORTCUT_GROUPS.map((g) =>
    g.id === 'view'
      ? {
          ...g,
          items: [
            ...g.items,
            {
              keys: acceleratorLabel(settings.quickLookShortcut, isMac),
              labelKey: 'shortcuts.quickLookAppWide'
            }
          ]
        }
      : g
  )
)

function close() {
  ui.showShortcutsDialog = false
}
</script>

<template>
  <BaseDialog width="500px" :title="$t('shortcutsDialog.title')" @close="close">
    <p class="dialog-note">
      Shortcuts for <strong>{{ platform }}</strong
      >.
    </p>
    <div class="groups">
      <section v-for="g in groups" :key="g.id" class="group">
        <h4>{{ $t(g.labelKey) }}</h4>
        <ul>
          <!-- Keyed by label: the quick look-up binding is user-chosen and may
               land on a combination already listed. -->
          <li v-for="s in g.items" :key="s.labelKey">
            <span class="label">{{ $t(s.labelKey) }}</span>
            <kbd>{{ s.keys }}</kbd>
          </li>
        </ul>
      </section>
    </div>
  </BaseDialog>
</template>

<style scoped src="./styles/KeyboardShortcutsDialog.css"></style>
