<script setup>
import { onMounted, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useSettingsStore } from '../stores/settingsStore'
import { THEMES } from '../utils/themes'
import BaseDialog from './BaseDialog.vue'
import LogSettings from './LogSettings.vue'
import SettingToggle from './SettingToggle.vue'
import ShortcutCapture from './ShortcutCapture.vue'
import SettingsLimits from './SettingsLimits.vue'

const diff = useDiffStore()
const settings = useSettingsStore()
const dir = ref('')
const isDefault = ref(true)
const busy = ref(false)

// One pane shows at a time behind the left rail.
const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'storage', label: 'Storage' },
  { id: 'limits', label: 'Limits' },
  { id: 'logs', label: 'Logs' },
  { id: 'fun', label: 'Fun' }
]

// Re-resolve the active theme so the rotation toggle applies immediately.
function toggleDailyTheme(on) {
  settings.setRotateThemeDaily(on)
  diff.resolveActiveTheme()
}
const tab = ref('appearance')

async function refresh() {
  const res = await window.api.dataDirGet()
  dir.value = res.dir
  isDefault.value = res.isDefault
}
onMounted(refresh)

// Moving the data folder restarts so key caches rebuild from the new location.
async function choose() {
  busy.value = true
  try {
    const res = await window.api.dataDirChoose()
    if (res.ok) await window.api.relaunch()
  } finally {
    busy.value = false
  }
}
async function reset() {
  busy.value = true
  try {
    const res = await window.api.dataDirReset()
    if (res.ok) await window.api.relaunch()
  } finally {
    busy.value = false
  }
}
function reveal() {
  window.api.dataDirReveal()
}
function close() {
  diff.showSettingsDialog = false
}
</script>

<template>
  <BaseDialog width="580px" title="Settings" @close="close">
    <div class="settings-body">
      <nav class="settings-nav" aria-label="Settings sections">
        <button
          v-for="t in TABS"
          :key="t.id"
          type="button"
          class="nav-item"
          :class="{ active: tab === t.id }"
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
      </nav>

      <div class="settings-pane">
        <section v-if="tab === 'appearance'">
          <h4>Theme</h4>
          <div class="theme-grid">
            <button
              v-for="t in THEMES"
              :key="t.id"
              type="button"
              class="theme-opt"
              :class="{ active: diff.theme === t.id }"
              :title="`Use the ${t.label} theme`"
              @click="diff.setTheme(t.id)"
            >
              <span class="swatch" :style="{ background: t.swatch.bg }">
                <span class="dot" :style="{ background: t.swatch.accent }"></span>
                <span class="dot" :style="{ background: t.swatch.add }"></span>
                <span class="dot" :style="{ background: t.swatch.del }"></span>
              </span>
              <span>{{ t.label }}</span>
            </button>
          </div>
          <SettingToggle :checked="settings.showShortcutBar" @change="settings.setShowShortcutBar">
            Show the keyboard-shortcut bar over diffs
          </SettingToggle>
          <SettingToggle :checked="settings.maximizeDialogs" @change="settings.setMaximizeDialogs">
            Maximize tool &amp; snippet windows (turn off to restore each one's size)
          </SettingToggle>
        </section>

        <section v-else-if="tab === 'shortcuts'">
          <h4>Quick look-up</h4>
          <p class="dialog-note">
            A floating search that finds any snippet or saved diff without raising the main window —
            it works even when Diff Bro is minimized. Click the field, then press the key combination
            you want.
          </p>
          <ShortcutCapture />
        </section>

        <section v-else-if="tab === 'storage'">
          <h4>Data folder</h4>
          <p class="dialog-note">
            Where saved diffs, snippets, and your keys are stored. Put it in a folder you control
            (e.g. Documents or a synced folder) so your data <strong>survives a reinstall</strong>.
            The folder is self-contained — after reinstalling, point Diff Bro back at it to restore
            everything.
          </p>
          <div class="path">
            <code :title="dir">{{ dir }}</code>
            <span v-if="isDefault" class="badge">default</span>
          </div>
          <div class="dialog-actions">
            <button class="btn btn-ghost" :disabled="busy" @click="reveal">Reveal</button>
            <button class="btn btn-ghost" :disabled="busy || isDefault" @click="reset">
              Use default
            </button>
            <button class="btn btn-primary" :disabled="busy" @click="choose">Change folder…</button>
          </div>
          <p class="hint">Changing the folder restarts Diff Bro.</p>
        </section>

        <LogSettings v-else-if="tab === 'logs'" />

        <section v-else-if="tab === 'fun'">
          <h4>Fun</h4>
          <label class="row toggle">
            <input
              type="checkbox"
              :checked="settings.rotateThemeDaily"
              @change="toggleDailyTheme($event.target.checked)"
            />
            <span>Rotate the app theme daily — a new random theme each day</span>
          </label>
          <p class="hint">
            Off by default. When off, Diff Bro uses the theme you picked under Appearance. The daily
            theme is the same all day and changes at midnight.
          </p>
        </section>

        <SettingsLimits v-else />
      </div>
    </div>

    <template #actions>
      <button class="btn btn-ghost" @click="close">Close</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
