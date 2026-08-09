<script setup>
// Hover preview popover (fixed-positioned to escape the sidebar scroll). Text
// renders via interpolation only; hovering in keeps it open for its action.
import { computed } from 'vue'
import { useSnippetStore } from '../stores/snippetStore'
import { shaped } from '../utils/props'
import MermaidDiagram from './MermaidDiagram.vue'
import SnippetCode from './SnippetCode.vue'
import SnippetSecretMask from './SnippetSecretMask.vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  /** From useSnippetPreview. @type {import('vue').PropType<import('../types').SnippetPreview>} */
  preview: { type: Object, required: true, validator: shaped('name', 'tags', 'text', 'style') },
  // The composable owns the copy (and its flash) — the card only shows it.
  copied: { type: Boolean, default: false }
})
defineEmits(['edit', 'view', 'copy'])
const store = useSnippetStore()
// A secret never previews as a diagram — that would render its contents.
const isMermaid = computed(() => props.preview.lang === 'mermaid' && !props.preview.secret)
</script>

<template>
  <div class="preview interactive" :class="{ fit: !isMermaid }" :style="preview.style">
    <div class="pv-head">
      <span class="pv-titlewrap">
        <span class="pv-label">{{ $t('snippetPreviewCard.title') }}</span>
        <span class="pv-name">{{ preview.name }}</span>
      </span>
      <span v-if="preview.lang" class="pv-lang">{{ preview.lang }}</span>
    </div>
    <!-- A Mermaid snippet previews as its rendered diagram;
         clicking it opens the full-screen zoomable viewer. -->
    <button
      v-if="isMermaid"
      class="pv-diagram"
      :data-tip="$t('snippetPreviewCard.viewFullScreen')"
      :aria-label="$t('snippetPreviewCard.viewThisDiagramFullScreen')"
      @click="$emit('view')"
    >
      <MermaidDiagram :code="preview.text" :debounce="0" />
    </button>
    <SnippetSecretMask v-else-if="preview.secret" compact />
    <button
      v-else
      class="pv-body"
      :data-tip="$t('snippetPreviewCard.openInEditor')"
      @click="$emit('edit')"
    >
      <SnippetCode :code="preview.text" :language="preview.lang" />
    </button>
    <div class="pv-foot">
      <span class="pv-tags">
        <span v-for="t in preview.tags" :key="t" class="pv-tag">
          <span class="dot" :style="{ background: store.colorOf(t) }"></span>{{ t }}
        </span>
        <span v-if="!preview.tags.length" class="pv-untagged">{{
          $t('snippetPreviewCard.untagged')
        }}</span>
      </span>
      <button
        class="pv-open"
        :data-tip="$t('snippetPreviewCard.copyTip')"
        :aria-label="$t('common.copy')"
        @click="$emit('copy')"
      >
        <AppIcon :name="copied ? 'check' : 'copy'" />
        {{ copied ? $t('common.copied') : $t('common.copy') }}
      </button>
      <button v-if="isMermaid" class="pv-open" @click="$emit('view')">
        <AppIcon name="diagram" /> {{ $t('snippetPreviewCard.viewFullScreen') }}
      </button>
      <button v-else class="pv-open" @click="$emit('edit')">
        <AppIcon name="expand" /> {{ $t('snippetPreviewCard.openInEditor') }}
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/SnippetPreviewCard.css"></style>
