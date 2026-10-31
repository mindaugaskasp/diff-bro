<script setup>
// Suggestions float, so nothing below moves while typing a tag.
import { computed, reactive, ref, watch } from 'vue'
import { useSnippetStore, MAX_TAGS } from '../stores/snippetStore'
import { TAGS_BEFORE_MORE } from '../utils/snippetState'
import { useTagInput } from '../composables/useTagInput'
import TagGlyph from './TagGlyph.vue'
import AppIcon from './AppIcon.vue'
import TagOverflowPopover from './TagOverflowPopover.vue'

const props = defineProps({
  /** @type {import('vue').PropType<string[]>} */
  initial: {
    type: Array,
    default: () => [],
    validator: (v) => v.every((t) => typeof t === 'string')
  },
  readonly: { type: Boolean, default: false }
})
const emit = defineEmits(['requestEdit', 'change'])

const store = useSnippetStore()
const tagInput = useTagInput(props.initial)
const field = reactive(tagInput)
const focused = ref(false)
const hidden = computed(() => Math.max(0, field.tags.length - TAGS_BEFORE_MORE))
watch(
  () => field.tagsWithTyped,
  (next) => emit('change', next)
)

function onBlur() {
  focused.value = false
  field.onBlur()
}
// The refs, not `...field`: a spread freezes what `remove` later reassigns.
defineExpose({ ...tagInput, focus: () => field.inputEl?.focus() })
</script>

<template>
  <div class="tag-row">
    <span
      v-for="t in field.tags.slice(0, TAGS_BEFORE_MORE)"
      :key="t"
      class="tag-word etag"
      :style="{ '--tc': field.colorFor(t) }"
    >
      <span class="tw-dot"></span>{{ t }}
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
        <span v-if="field.tooDeep" class="too-deep" role="alert">{{
          $t('tagChipsField.tooDeep', { path: field.tooDeep })
        }}</span>
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
