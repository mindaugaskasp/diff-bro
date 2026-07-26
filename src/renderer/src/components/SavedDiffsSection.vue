<script setup>
// The "Saved diffs" group: your own encrypted, auto-expiring (or kept) diffs,
// organized by TAGS shared with snippets (no categories). `search` narrows the
// visible rows by name or tag; `unified` renders the light group label.
import { computed, ref } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import SavedDiffRow from './SavedDiffRow.vue'
import SectionHeader from './SectionHeader.vue'
import { MOD } from '../keys'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  first: { type: Boolean, default: false },
  unified: { type: Boolean, default: false },
  search: { type: String, default: '' }
})
const q = computed(() => props.search.trim().toLowerCase())
const filt = (list) =>
  q.value
    ? list.filter(
        (e) => e.name.toLowerCase().includes(q.value) || e.tags.some((t) => t.includes(q.value))
      )
    : list

const vault = useVaultStore()
const open = ref(true)
const favOpen = ref(true)

const favorites = computed(() => filt(vault.favoritesOwn))
const listed = computed(() => filt(vault.ownActive))
const hasOwn = computed(() => vault.active.some((e) => !e.from))
</script>

<template>
  <section class="sidebar-section">
    <SectionHeader
      section-id="saved"
      title="Saved diffs"
      icon="folder"
      :open="open"
      :first="first"
      :unified="unified"
      @toggle="open = !open"
    />

    <div v-show="open" class="section-body">
      <p v-if="!hasOwn" class="empty">
        Nothing saved. Load two files and press <kbd>{{ MOD }}+S</kbd> to keep a diff around —
        encrypted, and auto-tagged by its format.
      </p>

      <!-- Favorites: a pinned golden group at the top. -->
      <div v-if="favorites.length" class="grp">
        <button class="grp-head" @click="favOpen = !favOpen">
          <AppIcon class="chev" :class="{ open: favOpen }" name="chevron-right" />
          <AppIcon class="grp-icon gold" name="star-filled" />
          <span class="grp-name gold">Favorites</span>
          <span class="grp-count">{{ favorites.length }}</span>
        </button>
        <ul v-show="favOpen" class="rows">
          <SavedDiffRow v-for="entry in favorites" :key="entry.id" :entry="entry" />
        </ul>
      </div>

      <ul v-if="listed.length" class="rows">
        <SavedDiffRow v-for="entry in listed" :key="entry.id" :entry="entry" />
      </ul>
    </div>
  </section>
</template>

<style scoped src="./styles/SavedDiffsSection.css"></style>
