<script setup>
// The "External diffs" sidebar section: diffs shared by someone else, each
// signed by its sender and kept separate from your own saved diffs. A Favorites
// shelf pins starred ones. Section move controls live in SectionHeader.
import { computed, ref } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import { useDiffStore } from '../stores/diffStore'
import SavedDiffRow from './SavedDiffRow.vue'
import SectionHeader from './SectionHeader.vue'
import { MOD } from '../keys'

defineProps({ first: { type: Boolean, default: false } })

const vault = useVaultStore()
const diff = useDiffStore()

const open = ref(true)
const importedFavs = computed(() => vault.importedFavorites)
const importedOthers = computed(() => vault.importedOthers)
const hasImported = computed(() => importedFavs.value.length || importedOthers.value.length)
</script>

<template>
  <section class="sidebar-section">
    <SectionHeader
      section-id="external"
      title="External diffs"
      :open="open"
      :first="first"
      @toggle="open = !open"
    />
    <div v-show="open" class="section-body">
      <div class="head-actions">
        <button
          class="btn btn-sm btn-block"
          :title="`Import a shared diff (${MOD}+I)`"
          @click="diff.importShared()"
        >
          Import
        </button>
      </div>
      <p v-if="!hasImported" class="empty">
        Diffs shared by someone else appear here — each is signed by its sender and shown separately
        from your own saved diffs. Press <kbd>{{ MOD }}+I</kbd> to open a sealed
        <code>.diffbro</code> file; it expires at the same moment as the sender's copy.
      </p>

      <ul v-if="importedFavs.length" class="favorites-group">
        <li class="fav-head">★ Favorites</li>
        <SavedDiffRow v-for="entry in importedFavs" :key="entry.id" :entry="entry" />
      </ul>

      <ul v-if="importedOthers.length">
        <SavedDiffRow v-for="entry in importedOthers" :key="entry.id" :entry="entry" />
      </ul>
    </div>
  </section>
</template>

<style scoped src="./styles/ExternalDiffsSection.css"></style>
