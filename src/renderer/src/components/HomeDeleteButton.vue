<script setup>
import { useHomeActions } from '../composables/useHomeActions'
import AppIcon from './AppIcon.vue'

defineProps({ item: { type: Object, required: true } })

const { deleteItem } = useHomeActions()
</script>

<template>
  <button
    type="button"
    class="row-btn delete home-delete"
    :aria-label="$t('homePanel.deleteItem', { name: item.name })"
    :data-tip="$t('homePanel.delete')"
    @click.stop="deleteItem(item)"
  >
    <AppIcon name="trash" />
  </button>
</template>
