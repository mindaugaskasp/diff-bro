<script setup>
import { usePopover } from '../composables/usePopover'
import AppIcon from './AppIcon.vue'

defineProps({
  /** @type {import('vue').PropType<string[]>} */
  tags: { type: Array, required: true },
  hidden: { type: Number, required: true },
  colorFor: { type: Function, required: true },
  readonly: { type: Boolean, default: false }
})
const emit = defineEmits(['remove'])
const { open, toggle, onKeydown, backdrop } = usePopover()
</script>

<template>
  <span class="anchor more-anchor" @keydown="onKeydown">
    <button
      type="button"
      class="more-chip"
      :aria-expanded="open"
      aria-haspopup="true"
      :aria-label="$t('tagChipsField.moreTags', { count: hidden })"
      @click="toggle"
    >
      +{{ hidden }}
    </button>
    <div
      v-if="open"
      class="popover tag-more-pop"
      role="group"
      :aria-label="$t('tagChipsField.allTags')"
    >
      <span v-for="t in tags" :key="t" class="tag-word etag" :style="{ '--tc': colorFor(t) }">
        <span class="tw-dot"></span>{{ t }}
        <button
          v-if="!readonly"
          type="button"
          class="x"
          :aria-label="$t('tagChipsField.removeTagLabel', { tag: t })"
          @click.stop="emit('remove', t)"
        >
          <AppIcon name="x" />
        </button>
      </span>
    </div>
  </span>
  <Teleport to="body">
    <div
      v-if="open"
      class="popover-backdrop"
      @pointerdown="backdrop.onPointerDown"
      @click="backdrop.onClick"
    />
  </Teleport>
</template>

<style scoped src="./styles/TagOverflowPopover.css"></style>
