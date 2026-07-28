<script setup>
import { ref } from 'vue'
import { useMatrixRain } from '../composables/useMatrixRain'

const props = defineProps({ fill: { type: Boolean, default: false } })
const canvas = ref(null)
useMatrixRain(canvas, props)
</script>

<template>
  <canvas ref="canvas" class="matrix-rain" :class="{ fill }" aria-hidden="true"></canvas>
</template>

<style scoped src="./styles/MatrixRain.css"></style>
