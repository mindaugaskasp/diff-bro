<script setup>
// Tag chips + typeahead, driven by a useTagInput() field the parent owns.
import { reactive } from 'vue'
import { useSnippetStore, MAX_TAGS } from '../stores/snippetStore'
import { useTagInput } from '../composables/useTagInput'
import TagGlyph from './TagGlyph.vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  // Tags the snippet already carries; the field owns them from here on.
  /** Tags the snippet already carries. @type {import('vue').PropType<string[]>} */
  initial: {
    type: Array,
    default: () => [],
    validator: (v) => v.every((t) => typeof t === 'string')
  },
  // View mode: show the tags as static chips (no input, no remove, no suggestions).
  readonly: { type: Boolean, default: false }
})
const store = useSnippetStore()
// reactive() so the template reads field.tags / .canAddMore without .value.
const field = reactive(useTagInput(props.initial))
// The parent saves the snippet, so it needs the tags and their pending colors.
defineExpose(field)
</script>

<template>
  <div class="tag-section">
    <div class="field-label">
      {{ $t('tagChipsField.tags') }}
      <span class="hint">{{ $t('tagChipsField.upTo', { max: MAX_TAGS }) }}</span>
    </div>
    <div class="tagfield" :class="{ ro: readonly }" @click="!readonly && field.inputEl?.focus()">
      <span
        v-for="t in field.tags"
        :key="t"
        class="tag-chip etag"
        :style="{ '--tc': field.colorFor(t) }"
      >
        <TagGlyph :color="field.colorFor(t)" />{{ t }}
        <button
          v-if="!readonly"
          type="button"
          class="x"
          :data-tip="$t('tagChipsField.removeTip', { tag: t })"
          :aria-label="$t('tagChipsField.removeTagLabel', { tag: t })"
          @click.stop="field.remove(t)"
        >
          <AppIcon name="x" />
        </button>
      </span>
      <span v-if="readonly && !field.tags.length" class="tag-empty">{{
        $t('tagChipsField.default')
      }}</span>
      <input
        v-if="!readonly"
        :ref="(el) => (field.inputEl = el)"
        v-model="field.input"
        class="taginput"
        :placeholder="field.canAddMore ? 'add a tag…' : ''"
        :disabled="!field.canAddMore"
        spellcheck="false"
        @keydown="field.onKey"
        @blur="field.onBlur"
      />
    </div>
    <div v-if="!readonly" class="cap" :class="{ full: !field.canAddMore }">
      {{ $t('tagChipsField.usedOf', { used: field.tags.length, max: MAX_TAGS })
      }}{{ field.canAddMore ? '' : $t('tagChipsField.removeOneFirst') }}
    </div>
    <div v-if="!readonly && field.suggestions.length && field.canAddMore" class="suggest">
      <button
        v-for="s in field.suggestions"
        :key="s"
        type="button"
        class="tag-chip sugg"
        :style="{ '--tc': store.colorOf(s) }"
        @mousedown.prevent
        @click="field.add(s)"
      >
        <TagGlyph :color="store.colorOf(s)" />{{ s }}
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/TagChipsField.css"></style>
