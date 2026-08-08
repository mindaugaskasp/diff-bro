<script setup>
// The launcher's new-snippet panel: it fills the preview pane while composing.
// The body is a transparent-text textarea over a <pre> of tokenized runs
// (useHighlightedInput) — never Monaco, which would cost the instant summon.
import { computed, nextTick, ref, toRef } from 'vue'
import { useCaretBackOut } from '../composables/useCaretBackOut'
import { useHighlightedInput } from '../composables/useHighlightedInput'
import { SNIPPET_LANGUAGES } from '../utils/detectLanguage'
import { t } from '../i18n'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  editing: { type: Boolean, default: false },
  canSave: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  resolvedLanguage: { type: String, default: 'plaintext' }
})
const name = defineModel('name', { type: String, required: true })
const body = defineModel('body', { type: String, required: true })
const language = defineModel('language', { type: String, required: true })
const emit = defineEmits(['save', 'cancel'])

const nameEl = ref(null)
const { textareaEl, overlayEl, lines, isPlain, onScroll, onCompositionStart, onCompositionEnd } =
  useHighlightedInput({ text: body, language: toRef(props, 'resolvedLanguage') })

// Auto carries what it resolved to, so the picker doubles as the readout and
// there is no second chip saying the same thing.
const labelOf = (id) =>
  t(SNIPPET_LANGUAGES.find((l) => l.id === id)?.labelKey ?? 'language.plaintext')
const options = computed(() =>
  SNIPPET_LANGUAGES.map(({ id, labelKey }) => ({
    id,
    label: id === 'auto' ? `${t(labelKey)} · ${labelOf(props.resolvedLanguage)}` : t(labelKey)
  }))
)

// Escape and ← back out, matching the list's ladder; ← defers to the caret.
const { onKeydown: backOut } = useCaretBackOut(() => emit('cancel'))

function onKeydown(e) {
  if (e.key === 'Escape') return emit('cancel')
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    if (props.canSave) emit('save')
    return
  }
  backOut(e)
}

// The body is what makes a snippet and the name is optional, so typing starts
// where the content goes; Shift+Tab reaches the name, then the language.
defineExpose({ focus: () => nextTick(() => textareaEl.value?.focus()) })
</script>

<template>
  <div class="ql-compose" @keydown="onKeydown">
    <div class="ql-compose-head band">
      <span class="ql-compose-title">{{
        editing ? $t('quickLookCompose.editSnippet') : $t('quickLookCompose.newSnippet')
      }}</span>
      <select
        v-model="language"
        class="ql-compose-lang focus-ring"
        :aria-label="$t('quickLookCompose.language')"
      >
        <option v-for="o in options" :key="o.id" :value="o.id">{{ o.label }}</option>
      </select>
    </div>

    <div class="ql-compose-body">
      <input
        ref="nameEl"
        v-model="name"
        class="ql-compose-name"
        type="text"
        :placeholder="$t('quickLookCompose.nameOptional')"
        autocomplete="off"
        spellcheck="false"
      />
      <div class="ql-compose-field">
        <pre ref="overlayEl" class="ql-compose-hl" aria-hidden="true"><div
          v-for="(spans, i) in lines"
          :key="i"
          class="ql-compose-line"
        ><span
          v-for="(span, j) in spans"
          :key="j"
          :class="span.role && `syn-${span.role}`"
        >{{ span.text }}</span></div></pre>
        <textarea
          ref="textareaEl"
          v-model="body"
          class="ql-compose-text"
          :class="{ plain: isPlain }"
          :placeholder="$t('quickLookCompose.pasteOrTypeTheSnippet')"
          spellcheck="false"
          @scroll="onScroll"
          @compositionstart="onCompositionStart"
          @compositionend="onCompositionEnd"
        ></textarea>
      </div>
    </div>

    <div class="ql-compose-foot band">
      <span class="ql-compose-actions">
        <button class="btn btn-sm" @click="emit('cancel')">
          {{ $t('common.cancel') }}
        </button>
        <button class="btn btn-primary btn-sm" :disabled="!canSave" @click="emit('save')">
          <AppIcon name="check" /> {{ saving ? $t('quickLookCompose.saving') : $t('common.save') }}
        </button>
      </span>
    </div>
  </div>
</template>

<style scoped src="./styles/QuickLookCompose.css"></style>
