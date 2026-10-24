<script setup>
// Drawn as tabs, but two pressed buttons: tab semantics would promise arrow-key roving.
defineProps({
  mine: { type: Number, required: true },
  received: { type: Number, required: true }
})
const whose = defineModel('whose', { type: String, required: true })
</script>

<template>
  <span class="whose" role="group" :aria-label="$t('diffsPanel.whose')">
    <button
      type="button"
      class="whose-opt"
      :class="{ on: whose === 'mine' }"
      :aria-pressed="whose === 'mine'"
      @click="whose = 'mine'"
    >
      {{ $t('diffsPanel.mine') }} <span class="count-chip">{{ mine }}</span>
    </button>
    <button
      type="button"
      class="whose-opt"
      :class="{ on: whose === 'received' }"
      :aria-pressed="whose === 'received'"
      @click="whose = 'received'"
    >
      {{ $t('diffsPanel.received') }} <span class="count-chip">{{ received }}</span>
    </button>
  </span>
</template>

<style scoped src="./styles/DiffsWhoseSwitch.css"></style>
