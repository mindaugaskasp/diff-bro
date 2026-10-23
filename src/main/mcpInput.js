// Everything a Claude client sends is untrusted input (rule 6).
import { EXPLICIT_LANGUAGES } from '../shared/snippetLanguages'

export const LIMITS = {
  name: 200,
  note: 2000,
  query: 200,
  id: 100,
  tag: 40,
  tags: 20,
  textBytes: 1024 * 1024
}

export class InputError extends Error {}

const optional = (args, key, check) => (args[key] === undefined ? undefined : check(args[key], key))

function text(value, key, max) {
  if (typeof value !== 'string') throw new InputError(`${key} must be a string`)
  if (value.length > max) throw new InputError(`${key} is longer than ${max} characters`)
  return value
}

function body(value, key) {
  if (typeof value !== 'string') throw new InputError(`${key} must be a string`)
  if (Buffer.byteLength(value) > LIMITS.textBytes) throw new InputError(`${key} is over 1 MB`)
  return value
}

function nonEmpty(value, key, max) {
  const out = text(value, key, max).trim()
  if (!out) throw new InputError(`${key} is required`)
  return out
}

function tagList(value, key) {
  if (!Array.isArray(value)) throw new InputError(`${key} must be an array of strings`)
  if (value.length > LIMITS.tags) throw new InputError(`${key} holds more than ${LIMITS.tags}`)
  return value.map((t) => nonEmpty(t, key, LIMITS.tag))
}

const argsOf = (args) => (args && typeof args === 'object' && !Array.isArray(args) ? args : {})

export const parseFilter = (raw) => {
  const args = argsOf(raw)
  return {
    query: optional(args, 'query', (v, k) => text(v, k, LIMITS.query)),
    tags: optional(args, 'tags', tagList)
  }
}

export const parseId = (raw) => nonEmpty(argsOf(raw).id, 'id', LIMITS.id)

export function parseFormat(raw) {
  const format = argsOf(raw).format ?? 'sides'
  if (format !== 'sides' && format !== 'unified') {
    throw new InputError('format must be "sides" or "unified"')
  }
  return format
}

export function parseCompare(raw) {
  const args = argsOf(raw)
  return { left: body(args.left, 'left'), right: body(args.right, 'right') }
}

const proposalBase = (args) => ({
  name: nonEmpty(args.name, 'name', LIMITS.name),
  note: optional(args, 'note', (v, k) => text(v, k, LIMITS.note)) ?? ''
})

export function parseSnippetProposal(raw) {
  const args = argsOf(raw)
  return {
    ...proposalBase(args),
    content: body(args.content, 'content'),
    language: EXPLICIT_LANGUAGES.includes(args.language) ? args.language : null,
    tags: optional(args, 'tags', tagList) ?? []
  }
}

export function parseComparisonProposal(raw) {
  const args = argsOf(raw)
  return { ...proposalBase(args), ...parseCompare(args) }
}
