<script setup>
// The photo studio: a snippet claims the diff column for one shot
// (diffStore.snippetShot), so the picture is the app's own rendering.
import { computed, ref } from 'vue'
import { useImageExportStore } from '../imageExportStore'
import { useCaptureRegion } from '../../../composables/useCaptureRegion'
import { shaped } from '../../../utils/props'
import MermaidDiagram from '../../../components/MermaidDiagram.vue'
import SnippetCode from '../../../components/SnippetCode.vue'

const props = defineProps({
  /** @type {import('vue').PropType<import('../types').SnippetShot>} */
  shot: { type: Object, required: true, validator: shaped('name', 'lang', 'code') }
})

const imageExport = useImageExportStore()
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
          @rendered="imageExport.snippetShotPainted()"
          @error="imageExport.snippetShotFailed()"
        />
      </div>
      <SnippetCode
        v-else
        :code="shot.code"
        :language="shot.lang"
        @settled="imageExport.snippetShotPainted()"
      />
    </div>
  </div>
</template>

<style scoped src="./styles/SnippetShot.css"></style>
