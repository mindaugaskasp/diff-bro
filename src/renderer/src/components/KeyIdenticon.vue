<script setup>
import { computed } from 'vue'
import { identiconCells } from '../utils/identicon'

const props = defineProps({ fingerprint: { type: String, default: '' } })
const cells = computed(() => identiconCells(props.fingerprint))
</script>

<template>
  <span class="identicon glyph-well" data-hue="secure" aria-hidden="true">
    <span v-for="(on, i) in cells" :key="i" :class="{ on }"></span>
  </span>
</template>

<style scoped src="./styles/KeyIdenticon.css"></style>
