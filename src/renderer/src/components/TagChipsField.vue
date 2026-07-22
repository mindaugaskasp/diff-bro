<script setup>
// Tag chips + typeahead input, driven by a useTagInput() field handed in by the
// parent (which owns the tags so it can save them). Presentation only.
import { reactive } from 'vue'
import { useSnippetStore, MAX_TAGS } from '../stores/snippetStore'
import { useTagInput } from '../composables/useTagInput'
import TagGlyph from './TagGlyph.vue'

const props = defineProps({
  // Tags the snippet already carries; the field owns them from here on.
  /** Tags the snippet already carries. @type {import('vue').PropType<string[]>} */
  initial: {
    type: Array,
    default: () => [],
    validator: (v) => v.every((t) => typeof t === 'string')
  }
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
      Tags <span class="hint">— up to {{ MAX_TAGS }}, or leave empty for Default</span>
    </div>
    <div class="tagfield" @click="field.inputEl?.focus()">
      <span v-for="t in field.tags" :key="t" class="etag" :style="{ '--tc': field.colorFor(t) }">
        <TagGlyph :color="field.colorFor(t)" />{{ t }}
        <button type="button" class="x" @click.stop="field.remove(t)">×</button>
      </span>
      <input
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
    <div class="cap" :class="{ full: !field.canAddMore }">
      {{ field.tags.length }} of {{ MAX_TAGS
      }}{{ field.canAddMore ? '' : ' — remove one to add another' }}
    </div>
    <div v-if="field.suggestions.length && field.canAddMore" class="suggest">
      <button
        v-for="s in field.suggestions"
        :key="s"
        type="button"
        class="sugg"
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
