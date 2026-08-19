<script setup>
// The rendered snippet view with a caret in it. Drawn through JiraRendered —
// interpolation, never v-html (rule 8); useContentEditable owns the loop.
import { computed, ref } from 'vue'
import JiraRendered from './JiraRendered.vue'
import { useContentEditable } from '../composables/useContentEditable'

const props = defineProps({
  content: { type: String, default: '' },
  /** @type {'markdown'|'jira'} */
  dialect: { type: String, default: 'markdown' }
})
const emit = defineEmits(['update:content'])

const rendered = ref(null)
// JiraRendered's root IS the element the caret lives in, so attributes fall
// through and domToBlocks reads exactly what was drawn.
const root = computed(() => rendered.value?.$el ?? null)
const content = computed({
  get: () => props.content,
  set: (value) => emit('update:content', value)
})
const dialect = computed(() => props.dialect)

const { blocks, version, onInput, onPaste, onKeydown, onToggleTask, applyFormat } =
  useContentEditable({ root, content, dialect })

defineExpose({ applyFormat, focus: () => root.value?.focus() })
</script>

<template>
  <JiraRendered
    ref="rendered"
    :key="version"
    class="rendered-editor"
    :blocks="blocks"
    tickable
    contenteditable="true"
    spellcheck="false"
    role="textbox"
    aria-multiline="true"
    :aria-label="$t('snippetEditorDialog.renderedEditor')"
    @input="onInput"
    @paste="onPaste"
    @keydown="onKeydown"
    @change="onToggleTask"
  />
</template>

<style scoped src="./styles/RenderedEditor.css"></style>
