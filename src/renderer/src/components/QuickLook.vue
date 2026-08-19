<script setup>
// Root of the floating quick look-up window (see src/main/quickLook.js); logic
// lives in useQuickLook. Preview renders via interpolation, never v-html (#7).
import { onMounted, ref } from 'vue'
import { useQuickLook } from '../composables/useQuickLook'
import { useLauncherFocus } from '../composables/useLauncherFocus'
import AppIcon from './AppIcon.vue'
import QuickLookCompose from './QuickLookCompose.vue'
import QuickLookConvert from './QuickLookConvert.vue'
import QuickLookPreview from './QuickLookPreview.vue'
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
  language: composeLanguage,
  resolvedLanguage: composeResolved,
  canSave: composeCanSave,
  saving: composeSaving,
  editing: composeEditing,
  open: openCompose,
  cancel: cancelCompose,
  save: saveCompose
} = compose
const input = ref(null)
const composeEl = ref(null)
const { focusInput, reclaimKeyboard } = useLauncherFocus({
  input,
  composeEl,
  composing,
  convertTool
})
// usePreviewLines scrolls this node, so the child hands it back up here.
const setPreviewEl = (el) => (previewEl.value = el)
// The + and Cmd+N are the same action: whatever was typed becomes the name.
const addSnippet = () => openCompose({ name: query.value.trim() })

onMounted(() => {
  focusInput()
  window.api.onQuickLookShow(() => {
    refresh()
    focusInput()
  })
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
            :resolved-language="composeResolved"
            :can-save="composeCanSave"
            :saving="composeSaving"
            :editing="composeEditing"
            @save="saveCompose"
            @cancel="cancelCompose"
          />
          <QuickLookPreview
            v-else-if="current"
            v-model:zone="zone"
            :current="current"
            :copied="copied"
            :copy-key="copyKey"
            :can-edit="canEditInline"
            :snippet-spans="snippetSpans"
            :line-class="lineClass"
            :hover-line="hoverLine"
            :set-scroll-el="setPreviewEl"
            @copy="copy(selected)"
            @edit="editCurrent"
            @choose="choose(selected)"
          />
          <div v-else class="ql-pv-none">{{ $t('quickLook.selectAResultToPreview') }}</div>
        </div>
      </div>

      <div class="ql-foot band drag-band">
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
