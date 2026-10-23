import { diffLines, toUnifiedDiff } from '../shared/unifiedDiff'
import { EXPLICIT_LANGUAGES } from '../shared/snippetLanguages'
import { listDiffs, listSnippets, readDiff, readSnippet } from './mcpLibrary'
import {
  InputError,
  parseCompare,
  parseComparisonProposal,
  parseFilter,
  parseFormat,
  parseId,
  parseSnippetProposal
} from './mcpInput'

const FILTER_SCHEMA = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Case-insensitive match on the name' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Every tag must be present' }
  }
}
const ID_SCHEMA = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
const PROPOSAL_NOTE = {
  type: 'string',
  description: 'Why you are proposing this; shown to the user beside Accept'
}

/**
 * @typedef {object} ToolContext
 * @property {{ enabled: boolean, scopes: Record<string, boolean> }} grant
 * @property {() => object} snippets   the parsed snippet store
 * @property {() => object} vault      the parsed saved-diff store
 * @property {(box: object, aad: string) => string|null} decrypt
 * @property {(kind: string, body: object) => { id: string }|{ error: string }} propose
 * @property {number} now
 */

const json = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] })
const refusal = (message) => ({ content: [{ type: 'text', text: message }], isError: true })
const NOT_FOUND = 'No such item, or it is not shared with Claude.'

function patchOf(left, right, labels) {
  const lines = diffLines(left, right)
  if (lines.error) throw new InputError('Too many lines to compare here; open it in DiffBro')
  return {
    patch: toUnifiedDiff(left, right, labels).patch,
    added: lines.lines.filter((l) => l.sign === '+').length,
    removed: lines.lines.filter((l) => l.sign === '-').length
  }
}

function proposed(ctx, kind, body) {
  const result = ctx.propose(kind, body)
  if (result.error) return refusal('The DiffBro inbox is full; ask the user to review it first.')
  return json({ proposalId: result.id, status: 'waiting for the user to review it in DiffBro' })
}

export const TOOLS = [
  {
    name: 'list_snippets',
    scope: 'snippets',
    description: "List the user's DiffBro snippets (names, tags, language; no contents).",
    inputSchema: FILTER_SCHEMA,
    run: (args, ctx) => json(listSnippets(ctx.snippets(), parseFilter(args)))
  },
  {
    name: 'get_snippet',
    scope: 'snippets',
    description: 'Read one snippet by id.',
    inputSchema: ID_SCHEMA,
    run: (args, ctx) => {
      const found = readSnippet(ctx.snippets(), parseId(args), ctx.decrypt)
      if (!found) return refusal(NOT_FOUND)
      return {
        ...json({ name: found.entry.name, content: found.content }),
        touched: found.entry.name
      }
    }
  },
  {
    name: 'list_saved_diffs',
    scope: 'diffs',
    description: "List the user's saved comparisons (names, tags, dates; no contents).",
    inputSchema: FILTER_SCHEMA,
    run: (args, ctx) => json(listDiffs(ctx.vault(), ctx.now, parseFilter(args)))
  },
  {
    name: 'get_saved_diff',
    scope: 'diffs',
    description: 'Read one saved comparison: both sides, or a unified diff.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, format: { enum: ['sides', 'unified'] } },
      required: ['id']
    },
    run: (args, ctx) => {
      const format = parseFormat(args)
      const found = readDiff(ctx.vault(), parseId(args), ctx.now, ctx.decrypt)
      if (!found) return refusal(NOT_FOUND)
      const { left, right } = found.sides
      const view =
        format === 'sides'
          ? { left, right }
          : patchOf(left.text, right.text, { leftLabel: left.name, rightLabel: right.name })
      return { ...json({ name: found.entry.name, ...view }), touched: found.entry.name }
    }
  },
  {
    name: 'compare_texts',
    scope: 'compare',
    description: 'Unified diff of two texts, with line counts. Reads and stores nothing.',
    inputSchema: {
      type: 'object',
      properties: { left: { type: 'string' }, right: { type: 'string' } },
      required: ['left', 'right']
    },
    run: (args) => {
      const { left, right } = parseCompare(args)
      return json(patchOf(left, right))
    }
  },
  {
    name: 'propose_snippet',
    scope: 'proposeSnippets',
    description:
      'Offer a snippet to the user. It waits in DiffBro until they accept or discard it.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        content: { type: 'string' },
        language: { enum: EXPLICIT_LANGUAGES },
        tags: { type: 'array', items: { type: 'string' } },
        note: PROPOSAL_NOTE
      },
      required: ['name', 'content']
    },
    run: (args, ctx) => {
      const body = parseSnippetProposal(args)
      return { ...proposed(ctx, 'snippet', body), touched: body.name }
    }
  },
  {
    name: 'propose_comparison',
    scope: 'proposeDiffs',
    description:
      'Offer a two-sided comparison to the user. It waits in DiffBro until they review it.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        left: { type: 'string' },
        right: { type: 'string' },
        note: PROPOSAL_NOTE
      },
      required: ['name', 'left', 'right']
    },
    run: (args, ctx) => {
      const body = parseComparisonProposal(args)
      return { ...proposed(ctx, 'comparison', body), touched: body.name }
    }
  }
]

/** @param {{ scopes: Record<string, boolean> }} grant */
export const toolList = (grant) =>
  TOOLS.filter((t) => grant.scopes[t.scope]).map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema
  }))

/**
 * @param {string} name
 * @param {object} args
 * @param {ToolContext} ctx
 * @returns {{ result: object, touched: string|null }}
 */
export function callTool(name, args, ctx) {
  const tool = TOOLS.find((t) => t.name === name)
  if (!tool) return { result: refusal(`Unknown tool: ${name}`), touched: null }
  if (!ctx.grant.scopes[tool.scope]) {
    return { result: refusal('This is turned off in DiffBro Settings → Claude.'), touched: null }
  }
  try {
    const { touched = null, ...result } = tool.run(args, ctx)
    return { result, touched }
  } catch (err) {
    if (err instanceof InputError) return { result: refusal(err.message), touched: null }
    throw err
  }
}
