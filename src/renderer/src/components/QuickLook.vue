<script setup>
// Root of the floating quick look-up window (see src/main/quickLook.js); logic
// lives in useQuickLook. The snippet preview renders through text interpolation
// only, never v-html (CLAUDE.md #7).
import { nextTick, onMounted, ref, watch } from 'vue'
import { useQuickLook } from '../composables/useQuickLook'
import { useSnippetStore } from '../stores/snippetStore'
import AppIcon from './AppIcon.vue'
import QuickLookConvert from './QuickLookConvert.vue'
import QuickLookResults from './QuickLookResults.vue'

const {
  query,
  selected,
  results,
  current,
  toolsOpen,
  snippetLines,
  lineClass,
  hoverLine,
  footHints,
  copyKey,
  zone,
  previewEl,
  choose,
  copy,
  copied,
  copiedName,
  copiedIndex,
  closing,
  refresh,
  onKeydown,
  convertTool,
  lastTool,
  exitConvert
} = useQuickLook()
const store = useSnippetStore()
const input = ref(null)

// Per-kind preview action + lock note — snippet opens, command/tools stay local.
// A tool speaks for itself (its own icon and action word), so the button never
// says a blanket "Convert" over a tool that formats or generates.
const ACTIONS = {
  snippet: { icon: 'edit', label: 'Open in editor' },
  tools: { icon: 'wrench', label: 'Browse tools' }
}
const previewAction = (it) =>
  it.kind === 'command' ? { icon: it.icon, label: it.action } : ACTIONS[it.kind]
const lockLabel = (it) => (it.kind === 'snippet' ? 'decrypted on demand' : 'runs on this machine')

function focusInput() {
  input.value?.focus()
  input.value?.select()
}

onMounted(() => {
  focusInput()
  window.api.onQuickLookShow(() => {
    refresh()
    focusInput()
  })
})

// Leaving convert mode must return focus to the search box, or the arrow-key
// navigation (driven by its @keydown) goes dead.
watch(convertTool, (tool) => {
  if (!tool) nextTick(focusInput)
})
</script>

<template>
  <div class="ql" :class="{ closing }">
    <!-- Mounted once and hidden, never destroyed: backing out to the list must
         not discard what you typed into a tool. -->
    <QuickLookConvert
      v-if="lastTool"
      v-show="convertTool"
      :tool="lastTool"
      :visible="!!convertTool"
      @back="exitConvert"
    />
    <template v-if="!convertTool">
      <div class="ql-search band">
        <AppIcon name="search" class="ql-search-ico" />
        <input
          ref="input"
          v-model="query"
          class="ql-input"
          type="text"
          placeholder="Search snippets & tools…"
          autocomplete="off"
          spellcheck="false"
          @keydown="onKeydown"
        />
        <span class="ql-kbd">Esc</span>
      </div>

      <div class="ql-body" :class="{ 'in-preview': zone === 'preview' }">
        <QuickLookResults
          v-model:selected="selected"
          :results="results"
          :copied="copied"
          :copied-index="copiedIndex"
          :tools-open="toolsOpen"
          @choose="choose"
        />

        <div class="ql-preview">
          <template v-if="current">
            <div class="ql-pv-head band">
              <button
                v-if="zone === 'preview'"
                class="ql-pv-back"
                title="Back to list (←)"
                @click="zone = 'list'"
              >
                <AppIcon name="chevron-left" />
              </button>
              <span class="ql-pv-name">{{ current.name }}</span>
              <span v-if="current.lang" class="ql-pv-lang">{{ current.lang }}</span>
              <button
                v-if="current.kind === 'snippet'"
                class="btn btn-sm ql-pv-copy"
                :title="`Copy contents (${copyKey})`"
                @click="copy(selected)"
              >
                <AppIcon :name="copied ? 'check' : 'copy'" /> {{ copied ? 'Copied' : 'Copy' }}
              </button>
            </div>
            <div v-if="current.tags?.length" class="ql-pv-tags">
              <span v-for="t in current.tags" :key="t" class="ql-pv-tag">
                <span class="dot" :style="{ background: store.colorOf(t) }"></span>{{ t }}
              </span>
            </div>

            <div
              v-if="current.kind === 'snippet'"
              ref="previewEl"
              class="ql-pv-body"
              :class="{ scrolling: zone === 'preview' }"
              @mouseover="hoverLine"
            >
              <div v-for="(line, i) in snippetLines" :key="i" :class="lineClass(i)">{{ line }}</div>
            </div>
            <div v-else class="ql-pv-msg">
              <p v-if="current.kind === 'tools'">
                Press <strong>→</strong> to browse the {{ current.count }} tools.
              </p>
              <p v-else>Press <strong>Enter</strong> to open this tool.</p>
            </div>

            <div class="ql-pv-foot band">
              <span class="ql-lock"><AppIcon name="lock" /> {{ lockLabel(current) }}</span>
              <span class="ql-pv-actions">
                <button class="btn btn-primary btn-sm" @click="choose(selected)">
                  <AppIcon :name="previewAction(current).icon" /> {{ previewAction(current).label }}
                </button>
              </span>
            </div>
          </template>
          <div v-else class="ql-pv-none">Select a result to preview it.</div>
        </div>
      </div>

      <div class="ql-foot band">
        <span v-for="[k, label] in footHints" :key="label"
          ><span class="ql-kbd">{{ k }}</span> {{ label }}</span
        >
      </div>
    </template>

    <transition name="ql-toast">
      <div v-if="copied" class="ql-toast" role="status">
        <AppIcon name="check" class="ok" /> Copied <strong>{{ copiedName }}</strong>
      </div>
    </transition>
  </div>
</template>

<style scoped src="./styles/QuickLook.css"></style>
