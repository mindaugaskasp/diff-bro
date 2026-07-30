<script setup>
// Self-imported so the recursion resolves under vue/no-undef-components.
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import JsonTree from './JsonTree.vue'

const props = defineProps({
  value: { type: null, required: true },
  k: { type: null, default: null },
  depth: { type: Number, default: 0 }
})

const isArr = computed(() => Array.isArray(props.value))
const isContainer = computed(() => props.value !== null && typeof props.value === 'object')
const entries = computed(() =>
  isArr.value
    ? props.value.map((v, i) => [i, v])
    : isContainer.value
      ? Object.entries(props.value)
      : []
)
const brace = computed(() => (isArr.value ? ['[', ']'] : ['{', '}']))
const open = ref(props.depth < 2)

const kind = computed(() => {
  const v = props.value
  if (v === null) return 'nul'
  const t = typeof v
  return t === 'string' ? 'str' : t === 'number' ? 'num' : 'bool'
})
const valText = computed(() => {
  const v = props.value
  if (typeof v !== 'string') return v === null ? 'null' : String(v)
  return v.length > 80 ? `"${v.slice(0, 80)}…"` : `"${v}"`
})
const pad = computed(() => ({ paddingLeft: `${props.depth * 14 + 8}px` }))
</script>

<template>
  <div class="jt">
    <div
      class="jt-row"
      :class="{ clickable: isContainer }"
      :style="pad"
      @click="isContainer && (open = !open)"
    >
      <span class="jt-tw">
        <AppIcon v-if="isContainer" :name="open ? 'chevron-down' : 'chevron-right'" />
      </span>
      <span v-if="k !== null" class="jt-key">{{ k }}</span>
      <span v-if="k !== null" class="jt-colon">:</span>
      <span v-if="isContainer" class="jt-punct">{{
        open ? brace[0] : `${brace[0]}${entries.length}${brace[1]}`
      }}</span>
      <span v-else class="jt-val" :class="kind" :title="typeof value === 'string' ? value : ''">{{
        valText
      }}</span>
    </div>
    <template v-if="isContainer && open">
      <JsonTree v-for="[ck, cv] in entries" :key="ck" :value="cv" :k="ck" :depth="depth + 1" />
      <div class="jt-close" :style="pad">
        <span class="jt-tw" />
        <span class="jt-punct">{{ brace[1] }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped src="./styles/JsonTree.css"></style>
