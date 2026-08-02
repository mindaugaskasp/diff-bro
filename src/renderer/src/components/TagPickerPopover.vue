<script setup>
// The tags that don't fit the bar. With a library grown over months the flat
// list is a wall, so this is searchable — typing "yaml" beats hunting a chip.
import { computed, ref } from 'vue'
import { arrayOfShape } from '../utils/props'
import TagGlyph from './TagGlyph.vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  /** @type {import('vue').PropType<Array<{name:string,color:string,count:number}>>} */
  tags: { type: Array, required: true, validator: arrayOfShape('name', 'count') },
  /** @type {import('vue').PropType<string[]>} */
  active: { type: Array, required: true }
})
const emit = defineEmits(['pick', 'close'])

const query = ref('')
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? props.tags.filter((t) => t.name.includes(q)) : props.tags
})
</script>

<template>
  <div class="picker-backdrop" @click="emit('close')">
    <div class="picker" role="dialog" aria-label="All tags" @click.stop>
      <div class="picker-head">
        <span>All tags</span>
        <button class="dialog-close" data-tip="Close" aria-label="Close" @click="emit('close')">
          <AppIcon name="x" />
        </button>
      </div>
      <input
        v-model="query"
        class="picker-search"
        type="text"
        spellcheck="false"
        placeholder="Find a tag…"
        aria-label="Find a tag"
      />
      <div class="picker-chips">
        <button
          v-for="t in shown"
          :key="t.name"
          class="tag-chip usb-tag"
          :class="{ on: active.includes(t.name) }"
          :style="{ '--tc': t.color }"
          :aria-pressed="active.includes(t.name)"
          @click="emit('pick', t.name)"
        >
          <TagGlyph :color="t.color || 'var(--text-dim)'" />{{ t.name }}
          <span class="usb-tct">{{ t.count }}</span>
        </button>
        <p v-if="!shown.length" class="picker-none">No tag matches “{{ query }}”.</p>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles/TagPickerPopover.css"></style>
