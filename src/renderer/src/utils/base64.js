// Unicode-safe Base64 (btoa/atob only handle Latin1, so route through
// TextEncoder/Decoder).

export function base64Encode(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

// Throws if `text` isn't valid Base64 — callers should catch.
export function base64Decode(text) {
  const binary = atob(text)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}
