<script setup>
// The photo studio. A snippet claims the diff column for the length of one shot
// (diffStore.snippetShot), is photographed by the same shutter a diff is, and is
// gone — so the picture is the app's own rendering, never a redraw.
import { computed, ref } from 'vue'
import { useDiffStore } from '../stores/diffStore'
import { useCaptureRegion } from '../composables/useCaptureRegion'
import { shaped } from '../utils/props'
import MermaidDiagram from './MermaidDiagram.vue'
import SnippetCode from './SnippetCode.vue'

const props = defineProps({
  /** @type {import('vue').PropType<import('../types').SnippetShot>} */
  shot: { type: Object, required: true, validator: shaped('name', 'lang', 'code') }
})

const store = useDiffStore()
const body = ref(null)
useCaptureRegion(body)

const isDiagram = computed(() => props.shot.lang === 'mermaid')
</script>

<template>
  <div class="snippet-shot" data-capture-stage>
    <div class="shot-head band band-row">
      <span class="shot-name">{{ shot.name }}</span>
      <span v-if="shot.lang" class="shot-lang">{{ shot.lang }}</span>
    </div>
    <div ref="body" class="shot-body">
      <div v-if="isDiagram" class="shot-figure">
        <MermaidDiagram
          :code="shot.code"
          :debounce="0"
          @rendered="store.snippetShotPainted()"
          @error="store.snippetShotFailed()"
        />
      </div>
      <SnippetCode
        v-else
        :code="shot.code"
        :language="shot.lang"
        @settled="store.snippetShotPainted()"
      />
    </div>
  </div>
</template>

<style scoped src="./styles/SnippetShot.css"></style>
