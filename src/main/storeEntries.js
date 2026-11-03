// Reading a library store's plaintext metadata, shared by every main-side reader.
export function parseStore(raw) {
  try {
    return JSON.parse(raw ?? '{}') ?? {}
  } catch {
    return {}
  }
}

export const entriesOf = (store) => (Array.isArray(store?.entries) ? store.entries : [])
export const isSecretEntry = (entry) => entry?.secret === true
