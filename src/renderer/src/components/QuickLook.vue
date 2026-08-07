<script setup>
// Root of the floating quick look-up window (see src/main/quickLook.js); logic
// lives in useQuickLook. Preview renders via interpolation, never v-html (#7).
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useQuickLook } from '../composables/useQuickLook'
import { useSnippetStore } from '../stores/snippetStore'
import { t } from '../i18n'
import AppIcon from './AppIcon.vue'
import QuickLookToolHint from './QuickLookToolHint.vue'
import QuickLookCompose from './QuickLookCompose.vue'
import QuickLookConvert from './QuickLookConvert.vue'
import QuickLookPreviewHead from './QuickLookPreviewHead.vue'
import QuickLookResults from './QuickLookResults.vue'
import QuickLookSearch from './QuickLookSearch.vue'

// prettier-ignore
const {
  query, selected, results, current, toolsOpen, snippetSpans, lineClass, hoverLine,
  footHints, copyKey, zone, previewEl, choose, copy, copied, copiedName, copiedIndex,
  closing, refresh, onKeydown, convertTool, lastTool, exitConvert, compose,
  canEditInline, editCurrent
} = useQuickLook()
// prettier-ignore
const {
  composing, name: composeName, body: composeBody, language: composeLanguage,
  resolvedLanguage: composeResolved, canSave: composeCanSave, saving: composeSaving,
  editing: composeEditing, start: startCompose, cancel: cancelCompose, save: saveCompose
} = compose
const store = useSnippetStore()
const input = ref(null)
const composeEl = ref(null)
// The + and Cmd+N are the same action: whatever was typed becomes the name.
const addSnippet = () => startCompose(query.value.trim())

// A tool speaks for itself (its own icon and action word), so the button never
// says a blanket "Convert" over one that formats or generates. Null for a kind
// with no action: reading `.icon` off undefined took the whole pane down once.
const ACTIONS = {
  snippet: { icon: 'edit', key: 'quickLook.action.openInEditor' },
  tools: { icon: 'wrench', key: 'quickLook.action.browseTools' },
  create: { icon: 'plus', key: 'quickLook.action.createSnippet' }
}
const previewAction = computed(() => {
  const it = current.value
  if (!it) return null
  if (it.kind === 'command') return { icon: it.icon, label: it.action }
  const a = ACTIONS[it.kind]
  return a ? { icon: a.icon, label: t(a.key) } : null
})

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
          @add="addSnippet"
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
            v-model:language="composeLanguage"
            :resolved="composeResolved"
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
                v-for="tag in current.tags"
                :key="tag"
                class="tag-word"
                :style="{ '--tc': store.colorOf(tag) }"
              >
                <span class="tw-dot"></span>
                <span class="tw-label">{{ tag }}</span>
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
            <QuickLookToolHint v-else :kind="current.kind" :count="current.count" />

            <div class="ql-pv-foot band">
              <span class="ql-pv-actions">
                <button
                  v-if="previewAction"
                  class="btn btn-primary btn-sm"
                  @click="choose(selected)"
                >
                  <AppIcon :name="previewAction.icon" /> {{ previewAction.label }}
                </button>
              </span>
            </div>
          </template>
          <div v-else class="ql-pv-none">{{ $t('quickLook.selectAResultToPreview') }}</div>
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
        <AppIcon name="check" class="ok" /> {{ $t('common.copied') }}
        <strong>{{ copiedName }}</strong>
      </div>
    </transition>
  </div>
</template>

<style scoped src="./styles/QuickLook.css"></style>
