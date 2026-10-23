import { defineStore } from 'pinia'
import { loadPersistedJson, savePersisted } from '../persist'
import { isEditorFont } from '../utils/editorFonts'

// Its own persisted key: settingsStore is at its size cap.
const KEY = 'editorFont'

const readFamily = () => {
  const family = loadPersistedJson(KEY).family ?? ''
  return isEditorFont(family) ? family : ''
}

export const useEditorFontStore = defineStore('editorFont', {
  state: () => ({ family: readFamily() }),
  actions: {
    setFamily(value) {
      this.family = isEditorFont(value) ? value : ''
      savePersisted(KEY, JSON.stringify({ family: this.family }))
    }
  }
})
