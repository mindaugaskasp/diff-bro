<script setup>
import { onMounted, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import {
  useSettingsStore,
  FILE_TYPE_LIMITS,
  MAX_SNIPPET_SIZE_KB_CAP
} from '../stores/settingsStore'
import { THEMES } from '../utils/themes'
import BaseDialog from './BaseDialog.vue'
import LogSettings from './LogSettings.vue'
import SettingToggle from './SettingToggle.vue'

const diff = useDiffStore()
const settings = useSettingsStore()
const dir = ref('')
const isDefault = ref(true)
const busy = ref(false)

// Settings split by domain so the window stays scannable; one pane shows at a
// time behind the left rail.
const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'storage', label: 'Storage' },
  { id: 'limits', label: 'Limits' },
  { id: 'logs', label: 'Logs' },
  { id: 'fun', label: 'Fun' }
]

// Toggle daily theme rotation, then re-resolve the active theme so it applies
// (or reverts to the Appearance choice) immediately.
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

// Changing where data lives moves the files, then restarts so every in-memory
// key cache is rebuilt cleanly from the new location.
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

        <section v-else>
          <h4>Limits</h4>
          <label v-for="(spec, type) in FILE_TYPE_LIMITS" :key="type" class="row">
            <span>Max {{ spec.label }} file (MB)</span>
            <input
              type="number"
              min="1"
              :max="spec.cap"
              :value="settings.fileSizeLimitMb(type)"
              @change="settings.setFileSizeLimitMb(type, $event.target.value)"
            />
          </label>
          <label class="row">
            <span>Max snippet size (KB)</span>
            <input
              type="number"
              min="16"
              :max="MAX_SNIPPET_SIZE_KB_CAP"
              :value="settings.maxSnippetSizeKb"
              @change="settings.setMaxSnippetSizeKb($event.target.value)"
            />
          </label>
          <p class="hint">
            Higher limits let you diff or store bigger content, at the cost of speed — raise them
            only if you need to.
          </p>
        </section>
      </div>
    </div>

    <template #actions>
      <button class="btn btn-ghost" @click="close">Close</button>
    </template>
  </BaseDialog>
</template>

<style scoped src="./styles/SettingsDialog.css"></style>
