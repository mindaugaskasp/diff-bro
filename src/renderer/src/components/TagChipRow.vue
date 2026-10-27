<script setup>
// Suggestions float, so nothing below moves while typing a tag.
import { computed, reactive, ref } from 'vue'
import { useSnippetStore, MAX_TAGS } from '../stores/snippetStore'
import { useTagInput } from '../composables/useTagInput'
import TagGlyph from './TagGlyph.vue'
import AppIcon from './AppIcon.vue'
import TagOverflowPopover from './TagOverflowPopover.vue'
import { useChipFold } from '../composables/useChipFold'

const props = defineProps({
  /** @type {import('vue').PropType<string[]>} */
  initial: {
    type: Array,
    default: () => [],
    validator: (v) => v.every((t) => typeof t === 'string')
  },
  readonly: { type: Boolean, default: false },
  fold: { type: Boolean, default: false }
})
const emit = defineEmits(['requestEdit'])

const store = useSnippetStore()
const field = reactive(useTagInput(props.initial))
const focused = ref(false)
const rowEl = ref(null)
const { shown } = useChipFold(rowEl, () => field.tags, props.fold)
const hidden = computed(() => Math.max(0, field.tags.length - shown.value))

function onBlur() {
  focused.value = false
  field.onBlur()
}
defineExpose({ ...field, focus: () => field.inputEl?.focus() })
</script>

<template>
  <div ref="rowEl" class="tag-row" :class="{ fold }">
    <span
      v-for="(t, i) in field.tags"
      :key="t"
      class="tag-chip etag"
      :class="{ folded: i >= shown }"
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
    <TagOverflowPopover
      v-if="hidden"
      :tags="field.tags"
      :hidden="hidden"
      :color-for="field.colorFor"
      :readonly="readonly"
      @remove="field.remove"
    />
    <button v-if="readonly" type="button" class="add-pill" @click="emit('requestEdit')">
      <AppIcon name="plus" /> {{ $t('tagChipsField.addTag') }}
    </button>
    <span v-else class="add-pill input-pill" :class="{ focused }">
      <input
        :ref="(el) => (field.inputEl = el)"
        v-model="field.input"
        class="taginput"
        :placeholder="field.canAddMore ? $t('tagChipsField.addPlaceholder') : ''"
        :disabled="!field.canAddMore"
        :aria-label="$t('tagChipsField.addTag')"
        spellcheck="false"
        @focus="focused = true"
        @keydown="field.onKey"
        @blur="onBlur"
      />
      <div
        v-if="focused"
        class="tag-pop"
        role="listbox"
        :aria-label="$t('tagChipsField.suggestions')"
      >
        <span class="cap" :class="{ full: !field.canAddMore }">
          {{ $t('tagChipsField.usedOf', { used: field.tags.length, max: MAX_TAGS })
          }}{{ field.canAddMore ? '' : $t('tagChipsField.removeOneFirst') }}
        </span>
        <div v-if="field.suggestions.length && field.canAddMore" class="suggest">
          <button
            v-for="s in field.suggestions"
            :key="s"
            type="button"
            role="option"
            class="tag-chip sugg"
            :style="{ '--tc': store.colorOf(s) }"
            @mousedown.prevent
            @click="field.add(s)"
          >
            <TagGlyph :color="store.colorOf(s)" />{{ s }}
          </button>
        </div>
      </div>
    </span>
  </div>
</template>

<style scoped src="./styles/TagChipsField.css"></style>
<style scoped src="./styles/TagChipRow.css"></style>
