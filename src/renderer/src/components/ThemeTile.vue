<script setup>
// One theme in the picker. A SPECIMEN, not three dots: a ground, an accent bar,
// two text rules and the add/remove pair, so the cell shows what a surface
// actually looks like on that theme.
//
// The specimen is also what BOUNDS the cell. `--border` scores 1.41–1.84
// against `--bg-raised` on twelve of the fourteen themes, so the keyline the
// old chip drew its box with was invisible on nearly all of them — an opaque
// ground is the only edge that survives every palette.
import { shaped } from '../utils/props'
import AppIcon from './AppIcon.vue'

defineProps({
  theme: { type: Object, required: true, validator: shaped('id', 'label', 'dark', 'swatch') },
  active: { type: Boolean, default: false }
})
defineEmits(['pick'])
</script>

<template>
  <button
    type="button"
    class="theme-tile"
    :class="{ active }"
    :aria-pressed="active"
    :aria-label="$t('settingsDialog.useTheme', { name: theme.label })"
    @click="$emit('pick')"
  >
    <span class="specimen" :style="{ background: theme.swatch.bg }">
      <span class="sp-row">
        <span class="sp-bar accent" :style="{ background: theme.swatch.accent }"></span>
        <span class="sp-bar ink" :class="{ onDark: theme.dark }"></span>
      </span>
      <span class="sp-bar ink faint" :class="{ onDark: theme.dark }"></span>
      <span class="sp-row">
        <span class="sp-bar ink dim" :class="{ onDark: theme.dark }"></span>
        <span class="sp-dots">
          <span class="sp-dot" :style="{ background: theme.swatch.add }"></span>
          <span class="sp-dot" :style="{ background: theme.swatch.del }"></span>
        </span>
      </span>
    </span>
    <span class="tile-name">
      {{ theme.label }}
      <AppIcon v-if="active" name="check" class="tile-check" />
    </span>
  </button>
</template>

<style scoped src="./styles/ThemeTile.css"></style>
