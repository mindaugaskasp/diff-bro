<script setup>
import { arrayOfShape } from '../utils/props'
import AppIcon from './AppIcon.vue'

defineProps({
  /** @type {import('vue').PropType<import('../types').SettingsGroup[]>} */
  groups: { type: Array, required: true, validator: arrayOfShape('id', 'labelKey', 'pages') },
  page: { type: String, required: true },
  open: { type: String, default: null }
})
defineEmits(['page', 'group'])
</script>

<template>
  <nav class="settings-nav" :aria-label="$t('settingsDialog.settingsSections')">
    <div v-for="group in groups" :key="group.id" class="nav-group">
      <button
        type="button"
        class="nav-item nav-group-row"
        :aria-expanded="open === group.id"
        @click="$emit('group', group.id)"
      >
        <span class="nav-label">{{ $t(group.labelKey) }}</span>
        <AppIcon class="nav-chevron" :name="open === group.id ? 'chevron-down' : 'chevron-right'" />
      </button>
      <template v-if="open === group.id">
        <button
          v-for="item in group.pages"
          :key="item.id"
          type="button"
          class="nav-item nav-child"
          :class="{ active: page === item.id }"
          :aria-current="page === item.id ? 'page' : undefined"
          @click="$emit('page', item.id)"
        >
          <span class="nav-label">{{ $t(item.labelKey) }}</span>
        </button>
      </template>
    </div>
  </nav>
</template>

<style scoped src="./styles/SettingsNav.css"></style>
