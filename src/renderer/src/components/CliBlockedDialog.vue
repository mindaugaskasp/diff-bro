<script setup>
// `diffbro compare …` arrived with every tab in use. The files are named in the
// message, so this only has to say what to do about it.
import { useDiffStore } from '../stores/diffStore'
import BaseDialog from './BaseDialog.vue'

const diff = useDiffStore()
</script>

<template>
  <BaseDialog width="380px" title="No free tab" @close="diff.dismissCliBlocked()">
    <p class="dialog-note">{{ diff.cliBlocked }}</p>
    <template #actions>
      <button class="btn btn-primary" @click="diff.dismissCliBlocked()">Got it</button>
    </template>
  </BaseDialog>
</template>
