import { describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'crypto'
import { vaultDecrypt, vaultEncrypt } from '../../src/main/vaultCrypt'
import { diffAad, snippetAad } from '../../src/shared/entryAad'
import { SCOPES } from '../../src/main/mcpGrant'
import { TOOLS, callTool, toolList } from '../../src/main/mcpTools'
import { resourceList, resourceRead } from '../../src/main/mcpResources'

const KEY = randomBytes(32)
const NOW = 5000
const allOn = { enabled: true, scopes: Object.fromEntries(SCOPES.map((s) => [s, true])) }
const only = (scope) => ({ enabled: true, scopes: { [scope]: true } })

const snippet = (id, extra = {}) => {
  const base = { id, aadSalt: id, createdAt: 1, name: `snip ${id}`, tags: [], ...extra }
  return { ...base, ...vaultEncrypt(KEY, `body ${id}`, snippetAad(id, id, 1)) }
}
const diff = (id, extra = {}) => {
  const base = { id, createdAt: 1, expiresAt: null, from: null, name: `diff ${id}`, ...extra }
  const payload = { mode: 'paste', pasteLeft: 'a\nb\n', pasteRight: 'a\nc\n' }
  const aad = diffAad(id, 1, base.expiresAt, base.from)
  return { ...base, ...vaultEncrypt(KEY, JSON.stringify(payload), aad) }
}

const ctxWith = (grant, extra = {}) => ({
  grant,
  snippets: () => ({ entries: [snippet('s1'), snippet('secret', { secret: true })] }),
  vault: () => ({ entries: [diff('d1'), diff('in', { from: 'Ada' })] }),
  decrypt: (box, aad) => vaultDecrypt(KEY, box, aad),
  propose: vi.fn(() => ({ id: 'p1' })),
  now: NOW,
  ...extra
})

const call = (name, args, ctx) => callTool(name, args, ctx)
const textOf = ({ result }) => result.content[0].text
const parsed = (res) => JSON.parse(textOf(res))

describe('mcp tools', () => {
  it('lists only the tools whose scope is on', () => {
    expect(toolList({ scopes: {} })).toEqual([])
    expect(toolList(only('snippets')).map((t) => t.name)).toEqual(['list_snippets', 'get_snippet'])
    expect(toolList(allOn)).toHaveLength(TOOLS.length)
  })

  it.each(TOOLS.map((t) => [t.name, t.scope]))('%s refuses without %s', (name, scope) => {
    const others = Object.fromEntries(SCOPES.map((s) => [s, s !== scope]))
    const res = call(name, {}, ctxWith({ enabled: true, scopes: others }))
    expect(res.result.isError).toBe(true)
    expect(textOf(res)).toMatch(/turned off/)
  })

  it('never returns a secret snippet or a received diff, even with every scope on', () => {
    const ctx = ctxWith(allOn)
    expect(parsed(call('list_snippets', {}, ctx)).map((s) => s.id)).toEqual(['s1'])
    expect(call('get_snippet', { id: 'secret' }, ctx).result.isError).toBe(true)
    expect(parsed(call('list_saved_diffs', {}, ctx)).map((d) => d.id)).toEqual(['d1'])
    expect(call('get_saved_diff', { id: 'in' }, ctx).result.isError).toBe(true)
    const uris = resourceList(ctx).map((r) => r.uri)
    expect(uris).toEqual(['diffbro://snippet/s1', 'diffbro://diff/d1'])
    expect(resourceRead('diffbro://snippet/secret', ctx).result).toBeNull()
    expect(resourceRead('diffbro://diff/in', ctx).result).toBeNull()
  })

  it('reads a snippet and names it as touched', () => {
    const res = call('get_snippet', { id: 's1' }, ctxWith(allOn))
    expect(parsed(res)).toEqual({ name: 'snip s1', content: 'body s1' })
    expect(res.touched).toBe('snip s1')
  })

  it('reads a saved diff as sides or as a unified diff', () => {
    const ctx = ctxWith(allOn)
    expect(parsed(call('get_saved_diff', { id: 'd1' }, ctx)).left.text).toBe('a\nb\n')
    const unified = parsed(call('get_saved_diff', { id: 'd1', format: 'unified' }, ctx))
    expect(unified).toMatchObject({ added: 1, removed: 1 })
    expect(unified.patch).toContain('-b\n+c')
  })

  it('compares two texts without touching the library', () => {
    const ctx = ctxWith(allOn, { snippets: vi.fn(), vault: vi.fn() })
    expect(parsed(call('compare_texts', { left: 'x\n', right: 'y\n' }, ctx))).toMatchObject({
      added: 1,
      removed: 1
    })
    expect(ctx.snippets).not.toHaveBeenCalled()
    expect(ctx.vault).not.toHaveBeenCalled()
  })

  it('hands a valid proposal to the inbox and nothing else', () => {
    const ctx = ctxWith(allOn)
    const res = call('propose_snippet', { name: ' Fix ', content: 'x', tags: ['a'] }, ctx)
    expect(ctx.propose).toHaveBeenCalledWith('snippet', {
      name: 'Fix',
      note: '',
      content: 'x',
      language: null,
      tags: ['a']
    })
    expect(parsed(res).proposalId).toBe('p1')
    call('propose_comparison', { name: 'C', left: 'a', right: 'b', note: 'n' }, ctx)
    expect(ctx.propose).toHaveBeenLastCalledWith('comparison', {
      name: 'C',
      note: 'n',
      left: 'a',
      right: 'b'
    })
  })

  it('drops a language the editor does not know rather than storing it', () => {
    const ctx = ctxWith(allOn)
    call('propose_snippet', { name: 'n', content: 'c', language: 'brainfuck' }, ctx)
    expect(ctx.propose.mock.calls[0][1].language).toBeNull()
    call('propose_snippet', { name: 'n', content: 'c', language: 'sql' }, ctx)
    expect(ctx.propose.mock.calls[1][1].language).toBe('sql')
  })

  it('says so when the inbox is full', () => {
    const ctx = ctxWith(allOn, { propose: () => ({ error: 'inbox-full' }) })
    const res = call('propose_snippet', { name: 'n', content: 'c' }, ctx)
    expect(res.result.isError).toBe(true)
    expect(textOf(res)).toMatch(/full/)
  })

  it.each([
    ['a missing name', { content: 'x' }],
    ['a blank name', { name: '  ', content: 'x' }],
    ['a long name', { name: 'n'.repeat(201), content: 'x' }],
    ['content over 1 MB', { name: 'n', content: 'x'.repeat(1024 * 1024 + 1) }],
    [
      'too many tags',
      { name: 'n', content: 'x', tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }
    ],
    ['a non-string tag', { name: 'n', content: 'x', tags: [{}] }],
    // #121: tags nest up to three levels; Claude cannot write a fourth.
    ['a tag nested four deep', { name: 'n', content: 'x', tags: ['ops/k8s/prod/eu'] }],
    ['an array for arguments', ['n']]
  ])('refuses a proposal with %s and writes nothing', (_label, args) => {
    const ctx = ctxWith(allOn)
    expect(call('propose_snippet', args, ctx).result.isError).toBe(true)
    expect(ctx.propose).not.toHaveBeenCalled()
  })

  it('refuses an unknown format and an unknown tool', () => {
    const ctx = ctxWith(allOn)
    expect(call('get_saved_diff', { id: 'd1', format: 'html' }, ctx).result.isError).toBe(true)
    expect(call('delete_everything', {}, ctx).result.isError).toBe(true)
  })

  it('reads resources only under their scope', () => {
    expect(resourceList(ctxWith(only('diffs'))).map((r) => r.uri)).toEqual(['diffbro://diff/d1'])
    expect(resourceRead('diffbro://snippet/s1', ctxWith(only('diffs'))).result).toBeNull()
    const read = resourceRead('diffbro://diff/d1', ctxWith(only('diffs')))
    expect(read.result.contents[0].text).toContain('+c')
    expect(resourceRead('file:///etc/passwd', ctxWith(allOn)).result).toBeNull()
  })
})
