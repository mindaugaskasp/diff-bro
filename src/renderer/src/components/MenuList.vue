<script setup>
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'

defineOptions({ name: 'MenuList' })
defineProps({
  /** buildMenus() rows: a top menu or a submenu is a row with `items`. */
  items: { type: Array, required: true },
  isPackaged: { type: Boolean, default: true },
  flyout: { type: Boolean, default: false }
})
const emit = defineEmits(['pick'])
const openSub = ref(null)
</script>

<template>
  <div class="dropdown" :class="{ flyout }" role="menu">
    <template v-for="(item, i) in items" :key="i">
      <template v-if="!(item.devOnly && isPackaged)">
        <div v-if="item.sep" class="sep" />
        <div v-else-if="item.info" class="item info">{{ item.label }}</div>
        <div v-else-if="item.items" class="submenu" @mouseenter="openSub = i">
          <button
            class="item"
            role="menuitem"
            aria-haspopup="menu"
            :aria-expanded="openSub === i"
            @click="openSub = openSub === i ? null : i"
          >
            <span>{{ item.label }}</span>
            <AppIcon class="arrow" name="chevron-right" />
          </button>
          <MenuList
            v-if="openSub === i"
            :items="item.items"
            :is-packaged="isPackaged"
            flyout
            @pick="emit('pick', $event)"
          />
        </div>
        <button
          v-else
          class="item"
          role="menuitem"
          @click="emit('pick', item)"
          @mouseenter="openSub = null"
        >
          <span>{{ item.label }}</span>
          <kbd v-if="item.keys">{{ item.keys }}</kbd>
        </button>
      </template>
    </template>
  </div>
</template>

<style scoped src="./styles/MenuList.css"></style>
