<script setup>
// The sidebar's search row. `#` scopes it to a tag path (#121): the chip keeps
// everything nested under that tag, and the search runs inside it.
import { computed, ref } from 'vue'
import { useTagScopeSearch } from '../composables/useTagScopeSearch'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, required: true },
  /** Every tag in the open list; empty turns the # scope off. */
  tags: { type: Array, default: () => [] },
  scope: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'update:scope'])

const box = ref(null)
defineExpose({ focus: () => box.value?.focus() })

const query = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})
const scope = computed({ get: () => props.scope, set: (v) => emit('update:scope', v) })
const { options, cursor, pick, startHash, onKeydown } = useTagScopeSearch({
  query,
  scope,
  tags: () => props.tags
})
function hash() {
  startHash()
  box.value?.focus()
}
</script>

<template>
  <div class="usb-top">
    <div class="field-search" data-tour="search">
      <AppIcon name="search" />
      <span v-if="scope" class="scope-chip">
        <span class="scope-text">{{ scope }}</span>
        <button
          type="button"
          :aria-label="$t('sidebarSearch.clearScope', { tag: scope })"
          @click="scope = ''"
        >
          <AppIcon name="x" />
        </button>
      </span>
      <input
        ref="box"
        v-model="query"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="options.length > 0"
        :placeholder="placeholder"
        spellcheck="false"
        @keydown="onKeydown"
      />
      <button
        v-if="modelValue"
        :data-tip="$t('sidebarSearch.clearTheSearchBox')"
        :aria-label="$t('sidebarSearch.clearSearch')"
        @click="query = ''"
      >
        <AppIcon name="x" />
      </button>
      <button
        v-else-if="tags.length && !scope"
        class="hash-btn"
        :data-tip="$t('sidebarSearch.scopeTip')"
        :aria-label="$t('sidebarSearch.scope')"
        @click="hash"
      >
        <AppIcon name="hash" />
      </button>
    </div>
    <ul v-if="options.length" class="scope-list" role="listbox">
      <li
        v-for="(path, i) in options"
        :key="path"
        role="option"
        :aria-selected="i === cursor"
        :class="{ on: i === cursor }"
        @mousedown.prevent="pick(path)"
      >
        {{ path }}
      </li>
    </ul>
  </div>
</template>

<style scoped src="./styles/SidebarSearch.css"></style>
