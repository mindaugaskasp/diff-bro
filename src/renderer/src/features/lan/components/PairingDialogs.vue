<script setup>
import { computed, onMounted } from 'vue'
import AddCodeDialog from './AddCodeDialog.vue'
import ShowCodeDialog from './ShowCodeDialog.vue'
import PairingResultDialog from './PairingResultDialog.vue'
import ItemOfferDialog from './ItemOfferDialog.vue'
import { useLanStore } from '../lanStore'

const lan = useLanStore()
onMounted(() => lan.init())
const stage = computed(() => lan.pairing?.stage)
const isEntering = computed(() => ['connecting', 'enter-code'].includes(stage.value))
</script>

<template>
  <template v-if="lan.pairing">
    <AddCodeDialog v-if="lan.pairing.role === 'adder' && isEntering" />
    <ShowCodeDialog v-else-if="stage === 'show-code'" />
    <PairingResultDialog v-else-if="stage !== 'added' && stage !== 'waiting'" />
  </template>
  <ItemOfferDialog v-else-if="lan.currentOffer" />
</template>
