<script setup>
import { arrayOfShape } from '../../../utils/props'
import AppIcon from '../../../components/AppIcon.vue'

defineProps({
  /** @type {import('vue').PropType<{ index: number, path: string, version: string, isCurrent: boolean }[]>} */
  programs: { type: Array, required: true, validator: arrayOfShape('index', 'path', 'isCurrent') },
  canFindAgain: { type: Boolean, default: false }
})
defineEmits(['choose', 'findAgain'])
</script>

<template>
  <div class="popover program-menu" role="menu" :aria-label="$t('runner.settings.found')">
    <button
      v-for="program in programs"
      :key="program.path"
      type="button"
      class="popover-row"
      role="menuitemradio"
      :aria-checked="program.isCurrent"
      @click="$emit('choose', program.index)"
    >
      <AppIcon class="mark" :class="{ 'is-current': program.isCurrent }" name="check" />
      <span class="version">{{ program.version }}</span>
      <span class="path">{{ program.path }}</span>
    </button>
    <div v-if="programs.length && canFindAgain" class="sep" />
    <button
      v-if="canFindAgain"
      type="button"
      class="popover-row"
      role="menuitem"
      @click="$emit('findAgain')"
    >
      {{ $t('runner.settings.findAgain') }}
    </button>
  </div>
</template>

<style scoped src="./styles/ProgramMenu.css"></style>
