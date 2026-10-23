import { toUnifiedDiff } from '../shared/unifiedDiff'
import { listDiffs, listSnippets, readDiff, readSnippet } from './mcpLibrary'

const URI = /^diffbro:\/\/(snippet|diff)\/([^/?#]{1,100})$/

/** @param {import('./mcpTools').ToolContext} ctx */
export function resourceList(ctx) {
  const snippets = ctx.grant.scopes.snippets ? listSnippets(ctx.snippets()) : []
  const diffs = ctx.grant.scopes.diffs ? listDiffs(ctx.vault(), ctx.now) : []
  return [
    ...snippets.map((s) => ({
      uri: `diffbro://snippet/${s.id}`,
      name: s.name,
      mimeType: 'text/plain'
    })),
    ...diffs.map((d) => ({ uri: `diffbro://diff/${d.id}`, name: d.name, mimeType: 'text/x-diff' }))
  ]
}

function contentOf(kind, id, ctx) {
  if (kind === 'snippet') {
    const found = ctx.grant.scopes.snippets && readSnippet(ctx.snippets(), id, ctx.decrypt)
    return found ? { name: found.entry.name, text: found.content } : null
  }
  const found = ctx.grant.scopes.diffs && readDiff(ctx.vault(), id, ctx.now, ctx.decrypt)
  if (!found) return null
  const { left, right } = found.sides
  const diff = toUnifiedDiff(left.text, right.text, {
    leftLabel: left.name,
    rightLabel: right.name
  })
  return diff.error ? null : { name: found.entry.name, text: diff.patch }
}

/**
 * @param {string} uri
 * @param {import('./mcpTools').ToolContext} ctx
 * @returns {{ result: object|null, touched: string|null }}
 */
export function resourceRead(uri, ctx) {
  const match = URI.exec(uri)
  const found = match && contentOf(match[1], decodeURIComponent(match[2]), ctx)
  if (!found) return { result: null, touched: null }
  return { result: { contents: [{ uri, text: found.text }] }, touched: found.name }
}
