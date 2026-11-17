<script setup>
import { needsUpdate, useLanStore } from '../../lan'

defineProps({ peers: { type: Array, required: true } })
const lan = useLanStore()
</script>

<template>
  <div class="nearby" data-testid="share-nearby">
    <div class="nearby-head">{{ $t('lan.share.nearby') }}</div>
    <ul class="recipients">
      <li v-for="peer in peers" :key="peer.fp">
        <div class="recipient nearby-row" :class="{ off: needsUpdate(peer) }">
          <span class="rc-name">{{ peer.name }}</span>
          <span v-if="needsUpdate(peer)" class="rc-net">{{ $t('lan.needsUpdate') }}</span>
          <button
            type="button"
            class="btn btn-sm"
            :disabled="needsUpdate(peer)"
            @click="lan.add(peer)"
          >
            {{ $t('lan.add.button') }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped src="./styles/RecipientPicker.css"></style>
