<script setup>
// Root of the floating quick look-up window (see src/main/quickLook.js); logic
// lives in useQuickLook. The snippet preview renders through text interpolation
// only, never v-html (CLAUDE.md #7).
import { nextTick, onMounted, ref, watch } from 'vue'
import { useQuickLook } from '../composables/useQuickLook'
import { useSnippetStore } from '../stores/snippetStore'
import AppIcon from './AppIcon.vue'
import QuickLookCompose from './QuickLookCompose.vue'
import QuickLookConvert from './QuickLookConvert.vue'
import QuickLookPreviewHead from './QuickLookPreviewHead.vue'
import QuickLookResults from './QuickLookResults.vue'
import QuickLookSearch from './QuickLookSearch.vue'

const {
  query,
  selected,
  results,
  current,
  toolsOpen,
  snippetSpans,
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
  exitConvert,
  compose,
  canEditInline,
  editCurrent
} = useQuickLook()
const {
  composing,
  name: composeName,
  body: composeBody,
  canSave: composeCanSave,
  saving: composeSaving,
  editing: composeEditing,
  start: startCompose,
  cancel: cancelCompose,
  save: saveCompose
} = compose
const store = useSnippetStore()
const input = ref(null)
const composeEl = ref(null)

// Per-kind preview action + lock note — snippet opens, command/tools stay local.
// A tool speaks for itself (its own icon and action word), so the button never
// says a blanket "Convert" over a tool that formats or generates.
const ACTIONS = {
  snippet: { icon: 'edit', label: 'Open in editor' },
  tools: { icon: 'wrench', label: 'Browse tools' }
}
const previewAction = (it) =>
  it.kind === 'command' ? { icon: it.icon, label: it.action } : ACTIONS[it.kind]

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

// The whole keyboard model hangs off the search box's @keydown, so ANY control
// that takes focus kills arrow navigation — clicking the preview's back arrow
// did exactly that. Hand the keyboard back once, here, rather than per path:
// a click lands on a button, the button's own handler has already run, and the
// search box takes focus again unless a mode owns it (the compose textarea, a
// tool panel) or the click was on a field.
function reclaimKeyboard(e) {
  if (composing.value || convertTool.value) return
  if (e.target.closest('input, textarea, [contenteditable]')) return
  input.value?.reclaim()
}

// Leaving convert mode must return focus to the search box, and the same applies
// on the way out of the compose panel, whether it was saved or cancelled.
watch(convertTool, (tool) => {
  if (!tool) nextTick(focusInput)
})
watch(composing, (on) => {
  if (on) nextTick(() => composeEl.value?.focus())
  else nextTick(focusInput)
})
</script>

<template>
  <div class="ql" :class="{ closing }" @click="reclaimKeyboard">
    <!-- Mounted once and hidden, never destroyed: backing out to the list must
         not discard what you typed into a tool. -->
    <transition name="ql-panel">
      <QuickLookConvert
        v-if="lastTool"
        v-show="convertTool"
        :tool="lastTool"
        :visible="!!convertTool"
        @back="exitConvert"
      />
    </transition>
    <template v-if="!convertTool">
      <transition name="ql-band">
        <QuickLookSearch
          v-if="!composing"
          ref="input"
          v-model:query="query"
          :readonly="zone === 'preview'"
          @keydown="onKeydown"
          @add="startCompose"
        />
      </transition>

      <div class="ql-body" :class="{ 'in-preview': zone === 'preview', composing }">
        <QuickLookResults
          v-model:selected="selected"
          :results="results"
          :copied="copied"
          :copied-index="copiedIndex"
          :tools-open="toolsOpen"
          @choose="choose"
        />

        <div class="ql-preview">
          <QuickLookCompose
            v-if="composing"
            ref="composeEl"
            v-model:name="composeName"
            v-model:body="composeBody"
            :can-save="composeCanSave"
            :saving="composeSaving"
            :editing="composeEditing"
            @save="saveCompose"
            @cancel="cancelCompose"
          />
          <template v-else-if="current">
            <QuickLookPreviewHead
              v-model:zone="zone"
              :current="current"
              :copied="copied"
              :copy-key="copyKey"
              :can-edit="canEditInline"
              @copy="copy(selected)"
              @edit="editCurrent"
            />
            <div v-if="current.tags?.length" class="ql-pv-tags">
              <span
                v-for="t in current.tags"
                :key="t"
                class="tag-word"
                :style="{ '--tc': store.colorOf(t) }"
              >
                <span class="tw-dot"></span>
                <span class="tw-label">{{ t }}</span>
              </span>
            </div>

            <div
              v-if="current.kind === 'snippet'"
              ref="previewEl"
              class="ql-pv-body"
              :class="{ scrolling: zone === 'preview' }"
              @mouseover="hoverLine"
            >
              <div v-for="(spans, i) in snippetSpans" :key="i" :class="lineClass(i)">
                <span
                  v-for="(span, j) in spans"
                  :key="j"
                  :class="span.role && `syn-${span.role}`"
                  >{{ span.text }}</span
                >
              </div>
            </div>
            <div v-else class="ql-pv-msg">
              <p v-if="current.kind === 'tools'">
                Press <strong>→</strong> to browse the {{ current.count }} tools.
              </p>
              <p v-else>Press <strong>Enter</strong> to open this tool.</p>
            </div>

            <div class="ql-pv-foot band">
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
