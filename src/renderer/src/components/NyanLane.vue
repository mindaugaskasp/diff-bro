<script setup>
// A slim rainbow lane under the toolbar, present only in the Nyan theme (App.vue
// mounts it with v-if). The cat loops across it continuously, trailing a rainbow
// that dissipates like smoke behind it — pure ambient whimsy, kept in the chrome
// so it never touches the diff. Decorative → aria-hidden, no logic to test.
</script>

<template>
  <div class="nyan-lane" aria-hidden="true">
    <div class="flyer">
      <div class="trail"></div>
      <svg class="nyan-body" viewBox="0 0 54 30">
        <rect x="14" y="7" width="27" height="16" rx="3" fill="#f7c8d8" stroke="#c04a6a" stroke-width="2" />
        <circle cx="22" cy="13" r="1.5" fill="#3a2a30" />
        <circle cx="31" cy="13" r="1.5" fill="#3a2a30" />
        <circle cx="20" cy="16.5" r="1.5" fill="#ff9dc0" />
        <circle cx="33" cy="16.5" r="1.5" fill="#ff9dc0" />
        <rect x="24" y="16.5" width="4" height="2" fill="#c04a6a" />
        <rect x="39" y="9" width="11" height="13" rx="3" fill="#9aa0a6" />
        <path d="M40 9 l3 -4 l3 4 z M47 9 l3 -4 l3 4 z" fill="#9aa0a6" />
        <circle cx="45" cy="14.5" r="1.3" fill="#111" />
        <circle cx="49" cy="14.5" r="1.3" fill="#111" />
        <rect x="16" y="23" width="4" height="4" fill="#6b7075" />
        <rect x="34" y="23" width="4" height="4" fill="#6b7075" />
      </svg>
    </div>
  </div>
</template>

<style scoped src="./styles/NyanLane.css"></style>
