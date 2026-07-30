// URL percent-encoding and query-param parse/rebuild for the URL tool. Pure so it
// unit-tests without a DOM; ToolUrl.vue is the only UI.
//
// "component" escapes everything (encodeURIComponent) — use it for a single value;
// "full" (encodeURI) leaves the reserved URL delimiters (:/?#&=) intact.

export function encodeUrl(text, { component = true } = {}) {
  const s = String(text)
  return component ? encodeURIComponent(s) : encodeURI(s)
}

export function decodeUrl(text, { component = true } = {}) {
  try {
    const s = String(text)
    return component ? decodeURIComponent(s) : decodeURI(s)
  } catch {
    return '' // malformed percent-escape — the tool reports it as invalid
  }
}

const safeDecode = (s) => {
  try {
    return decodeURIComponent(String(s).replace(/\+/g, ' '))
  } catch {
    return String(s)
  }
}

/**
 * Split a URL into the part before '?' and its decoded query params (any fragment
 * is kept out of the params). params is [] when there is no query string.
 * @param {string} url
 * @returns {{ base: string, params: Array<{ key: string, value: string }> }}
 */
export function parseQuery(url) {
  const s = String(url)
  const q = s.indexOf('?')
  if (q === -1) return { base: s, params: [] }
  const base = s.slice(0, q)
  const rest = s.slice(q + 1)
  const hash = rest.indexOf('#')
  const query = hash === -1 ? rest : rest.slice(0, hash)
  if (!query) return { base, params: [] }
  const params = query.split('&').map((pair) => {
    const eq = pair.indexOf('=')
    return {
      key: safeDecode(eq === -1 ? pair : pair.slice(0, eq)),
      value: eq === -1 ? '' : safeDecode(pair.slice(eq + 1))
    }
  })
  return { base, params }
}

// base + '?' + re-encoded params (empty rows dropped). Query pairs always use
// component encoding — full-URI encoding would leave '&'/'=' unescaped in a value
// and break the URL.
export function buildQuery(base, params) {
  const active = params.filter((p) => p.key !== '' || p.value !== '')
  if (!active.length) return String(base)
  const pairs = active.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
  return `${base}?${pairs.join('&')}`
}
