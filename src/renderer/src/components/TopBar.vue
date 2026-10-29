<script setup>
// The one row above the comparison (#144): the ≡ menu where there is no native
// bar, the tabs, then the actions. Each keeps its own component.
import { isMac } from '../keys'
import AppToolbar from './AppToolbar.vue'
import DiffTabBar from './DiffTabBar.vue'
import MenuBar from './MenuBar.vue'
</script>

<template>
  <div class="topbar band">
    <MenuBar v-if="!isMac" />
    <DiffTabBar />
    <AppToolbar />
  </div>
</template>

<style scoped src="./styles/TopBar.css"></style>
