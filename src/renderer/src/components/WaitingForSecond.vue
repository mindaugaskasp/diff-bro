<script setup>
// One side loaded: make it obvious a second file is still needed. Its own
// component so App's template stays inside its cap.
defineProps({
  name: { type: String, required: true },
  /** Which side is still empty — 'left' or 'right'. */
  missing: { type: String, required: true }
})
</script>

<template>
  <div class="empty waiting">
    <i18n-t keypath="app.loadedOne" tag="p" class="waiting-title">
      <template #name
        ><strong>{{ name }}</strong></template
      >
    </i18n-t>
    <i18n-t keypath="app.nowChooseOther" tag="p">
      <template #side
        ><strong>{{ $t(`common.${missing}`) }}</strong></template
      >
    </i18n-t>
  </div>
</template>
