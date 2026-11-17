const listeners = new Set()

// Network sharing holds the key it started with; it listens here to restart when the key is replaced.
export const onIdentityPersisted = (listener) => listeners.add(listener)

export function identityPersisted() {
  for (const listener of listeners) listener()
}
