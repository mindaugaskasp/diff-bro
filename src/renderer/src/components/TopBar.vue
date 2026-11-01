<script setup>
// The one row above the comparison (#144): the tabs, then the actions.
import AppToolbar from './AppToolbar.vue'
import DiffTabBar from './DiffTabBar.vue'
</script>

<template>
  <div class="topbar band">
    <DiffTabBar />
    <AppToolbar />
  </div>
</template>

<style scoped src="./styles/TopBar.css"></style>
