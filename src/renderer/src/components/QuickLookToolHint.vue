<script setup>
// The preview pane's message when the selected row is a tool rather than a
// snippet. Its own component so QuickLook's template stays inside its cap.
//
// <i18n-t> renders ONE message with the key cap as a slot: split into
// "Press" + <strong>→</strong> + "to browse…" it could not be translated, since
// word order round the key differs by language.
defineProps({
  /** 'tools' collapses the whole group, 'create' starts one; else a single tool. */
  kind: { type: String, required: true },
  count: { type: Number, default: 0 }
})
</script>

<template>
  <div class="ql-pv-msg">
    <i18n-t v-if="kind === 'create'" keypath="quickLook.createHint" tag="p">
      <template #key
        ><strong>{{ $t('quickLook.enter') }}</strong></template
      >
    </i18n-t>
    <i18n-t v-else-if="kind === 'tools'" keypath="quickLook.browseTools" tag="p" :plural="count">
      <template #key><strong>→</strong></template>
    </i18n-t>
    <i18n-t v-else keypath="quickLook.openTool" tag="p">
      <template #key
        ><strong>{{ $t('quickLook.enter') }}</strong></template
      >
    </i18n-t>
  </div>
</template>
