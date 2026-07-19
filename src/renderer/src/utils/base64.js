// Unicode-safe Base64 encode/decode for the Tools menu. Plain btoa/atob only
// handle Latin1, so text is routed through TextEncoder/TextDecoder first —
// all native browser APIs, no dependency needed.

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
