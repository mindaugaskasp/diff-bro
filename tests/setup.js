// Node >= 22 ships an experimental global `localStorage` (backed by
// --localstorage-file) that shadows jsdom's and is non-functional in test
// workers. Replace it with a plain in-memory Storage for deterministic tests.
class MemStorage {
  #map = new Map()
  getItem(k) {
    return this.#map.has(k) ? this.#map.get(k) : null
  }
  setItem(k, v) {
    this.#map.set(String(k), String(v))
  }
  removeItem(k) {
    this.#map.delete(k)
  }
  clear() {
    this.#map.clear()
  }
  key(i) {
    return [...this.#map.keys()][i] ?? null
  }
  get length() {
    return this.#map.size
  }
}

const storage = new MemStorage()
for (const target of [globalThis, globalThis.window].filter(Boolean)) {
  Object.defineProperty(target, 'localStorage', { value: storage, configurable: true })
}
