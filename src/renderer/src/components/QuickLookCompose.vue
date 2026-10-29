<script setup>
// Highlighted textarea (useHighlightedInput), never Monaco: it would cost the instant summon.
import { computed, nextTick, toRef } from 'vue'
import { useHighlightedInput } from '../composables/useHighlightedInput'
import { useFormatToolbar } from '../composables/useFormatToolbar'
import { useTextareaMarkup } from '../composables/useTextareaMarkup'
import FormatToolbar from './FormatToolbar.vue'
import JiraRendered from './JiraRendered.vue'
import MarkdownRendered from './MarkdownRendered.vue'
import SnippetNameField from './SnippetNameField.vue'
import { SNIPPET_LANGUAGES } from '../utils/detectLanguage'
import { t } from '../i18n'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  canSave: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  resolvedLanguage: { type: String, default: 'plaintext' }
})
const name = defineModel('name', { type: String, required: true })
const body = defineModel('body', { type: String, required: true })
const language = defineModel('language', { type: String, required: true })
const emit = defineEmits(['save', 'back', 'dismiss', 'open'])

const { textareaEl, overlayEl, lines, isPlain, onScroll, onCompositionStart, onCompositionEnd } =
  useHighlightedInput({ text: body, language: toRef(props, 'resolvedLanguage') })

// The two languages that are written IN markup get the same row of buttons the
// main editor gives them. Driven off the RESOLVED language, so a body detected
// as Markdown on Auto gets it without anyone naming the language.
const isMarkdown = computed(() => props.resolvedLanguage === 'markdown')
const hasMarkup = computed(() => isMarkdown.value || props.resolvedLanguage === 'jira')
const { applySelectionEdit } = useTextareaMarkup(textareaEl, body)
const { actions: markupActions, applyAction } = useFormatToolbar({ isMarkdown, applySelectionEdit })

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

const chord = (e) => (e.metaKey || e.ctrlKey) && !e.altKey
function onKeydown(e) {
  if (e.key === 'Escape') return emit('dismiss')
  if (chord(e) && e.key === 'Enter') {
    e.preventDefault()
    return emit('open')
  }
  if (chord(e) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (props.canSave) emit('save')
  }
}

// The body is what makes a snippet and the name is optional, so typing starts
// where the content goes; Shift+Tab reaches the name, then the language.
defineExpose({ focus: () => nextTick(() => textareaEl.value?.focus()) })
</script>

<template>
  <div class="ql-compose" @keydown="onKeydown">
    <div class="ql-compose-head band drag-band">
      <button
        type="button"
        class="btn btn-icon ql-compose-back"
        :data-tip="$t('quickLook.backTip')"
        :aria-label="$t('quickLook.backLabel')"
        @click="emit('back')"
      >
        <AppIcon name="chevron-left" />
      </button>
      <SnippetNameField
        v-model="name"
        class="ql-compose-namefield"
        input-class="ql-compose-name"
        :placeholder="$t('quickLookCompose.nameOptional')"
      />
      <button class="btn btn-primary btn-sm" :disabled="!canSave" @click="emit('save')">
        <AppIcon name="check" /> {{ saving ? $t('quickLookCompose.saving') : $t('common.save') }}
      </button>
    </div>

    <FormatToolbar v-if="hasMarkup" :actions="markupActions" @action="applyAction" />

    <div class="ql-compose-body">
      <div class="ql-compose-split" :class="{ previewing: hasMarkup }">
        <div class="ql-compose-field">
          <!-- Whitespace between these tags RENDERS and shifts every line. -->
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
        <!-- Markup is written to be read as its rendered form, so it is drawn
             beside the syntax rather than behind a toggle. -->
        <div v-if="hasMarkup" class="ql-compose-preview">
          <MarkdownRendered v-if="isMarkdown" :content="body" />
          <JiraRendered v-else :content="body" />
        </div>
      </div>
    </div>

    <div class="ql-compose-foot band drag-band">
      <select
        v-model="language"
        class="ql-compose-lang focus-ring"
        :aria-label="$t('quickLookCompose.language')"
      >
        <option v-for="o in options" :key="o.id" :value="o.id">{{ o.label }}</option>
      </select>
    </div>
  </div>
</template>

<style scoped src="./styles/QuickLookCompose.css"></style>
