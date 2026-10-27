<script setup>
import AppIcon from './AppIcon.vue'

const props = defineProps({
  store: { type: String, required: true, validator: (v) => ['vault', 'snippets'].includes(v) }
})
const reveal = () => window.api.storeReveal(props.store)
</script>

<template>
  <button
    class="row-btn"
    :data-tip="
      props.store === 'vault' ? $t('showInFolder.tip.vault') : $t('showInFolder.tip.snippets')
    "
    :aria-label="$t('showInFolder.label')"
    @click="reveal"
  >
    <AppIcon name="folder" />
  </button>
</template>
