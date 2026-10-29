<script setup>
// Root of the quick look-up window (src/main/quickLook.js); logic lives in useQuickLook.
import { onMounted, ref } from 'vue'
import { useQuickLook } from '../composables/useQuickLook'
import { useLauncherFocus } from '../composables/useLauncherFocus'
import AppIcon from './AppIcon.vue'
import QuickLookCompose from './QuickLookCompose.vue'
import QuickLookConvert from './QuickLookConvert.vue'
import QuickLookResults from './QuickLookResults.vue'
import QuickLookSearch from './QuickLookSearch.vue'

const {
  query,
  selected,
  results,
  toolsOpen,
  choose,
  openFromSheet,
  dismiss,
  copied,
  copiedName,
  copiedIndex,
  closing,
  refresh,
  onKeydown,
  convertTool,
  lastTool,
  exitConvert,
  compose
} = useQuickLook()
const {
  composing,
  name: composeName,
  body: composeBody,
  language: composeLanguage,
  resolvedLanguage: composeResolved,
  canSave: composeCanSave,
  saving: composeSaving,
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
        @dismiss="dismiss"
      />
    </transition>
    <template v-if="!convertTool">
      <QuickLookCompose
        v-if="composing"
        ref="composeEl"
        v-model:name="composeName"
        v-model:body="composeBody"
        v-model:language="composeLanguage"
        :resolved-language="composeResolved"
        :can-save="composeCanSave"
        :saving="composeSaving"
        @save="saveCompose"
        @back="cancelCompose"
        @dismiss="dismiss"
        @open="openFromSheet"
      />
      <template v-else>
        <QuickLookSearch ref="input" v-model:query="query" @keydown="onKeydown" @add="addSnippet" />
        <QuickLookResults
          v-model:selected="selected"
          :results="results"
          :copied="copied"
          :copied-index="copiedIndex"
          :tools-open="toolsOpen"
          @choose="choose"
        />
      </template>
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
