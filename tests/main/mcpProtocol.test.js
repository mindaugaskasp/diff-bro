import { describe, expect, it, vi } from 'vitest'
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSIONS, createMcpSession } from '../../src/main/mcpProtocol'

const handlers = () => ({
  isEnabled: vi.fn(() => true),
  listTools: vi.fn(() => [{ name: 'list_snippets', inputSchema: { type: 'object' } }]),
  callTool: vi.fn(async (name, args) => ({
    content: [{ type: 'text', text: `${name}:${args.q}` }]
  })),
  listResources: vi.fn(() => [{ uri: 'diffbro://snippet/1', name: 'one' }]),
  readResource: vi.fn(async (uri) => ({ contents: [{ uri, text: 'body' }] }))
})

const send = (session, message) =>
  session.handleLine(typeof message === 'string' ? message : JSON.stringify(message))

describe('mcp protocol', () => {
  it('answers initialize with the version the client asked for when supported', async () => {
    const session = createMcpSession(handlers(), { name: 'diffbro', version: '1.0.0' })
    const res = await send(session, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: PROTOCOL_VERSIONS[1] }
    })
    expect(res.id).toBe(1)
    expect(res.result.protocolVersion).toBe(PROTOCOL_VERSIONS[1])
    expect(res.result.serverInfo).toEqual({ name: 'diffbro', version: '1.0.0' })
    expect(res.result.capabilities).toEqual({ tools: {}, resources: {} })
  })

  it('offers its newest version for one it does not know', async () => {
    const session = createMcpSession(handlers(), { name: 'd', version: '1' })
    const res = await send(session, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '1999-01-01' }
    })
    expect(res.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0])
  })

  it('stays silent on a notification', async () => {
    const session = createMcpSession(handlers(), { name: 'd', version: '1' })
    expect(await send(session, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
  })

  it('lists and calls tools through the handlers', async () => {
    const h = handlers()
    const session = createMcpSession(h, { name: 'd', version: '1' })
    const list = await send(session, { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    expect(list.result.tools[0].name).toBe('list_snippets')
    const call = await send(session, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_snippets', arguments: { q: 'x' } }
    })
    expect(call.result.content[0].text).toBe('list_snippets:x')
  })

  it('reads resources through the handlers', async () => {
    const session = createMcpSession(handlers(), { name: 'd', version: '1' })
    const res = await send(session, {
      jsonrpc: '2.0',
      id: 4,
      method: 'resources/read',
      params: { uri: 'diffbro://snippet/1' }
    })
    expect(res.result.contents[0].text).toBe('body')
  })

  it('answers a resource it cannot read with resource-not-found', async () => {
    const h = handlers()
    h.readResource.mockResolvedValue(null)
    const session = createMcpSession(h, { name: 'd', version: '1' })
    const res = await send(session, {
      jsonrpc: '2.0',
      id: 4,
      method: 'resources/read',
      params: { uri: 'diffbro://snippet/secret' }
    })
    expect(res.error.code).toBe(-32002)
  })

  it('refuses every call while the connection is off, and asks on each one', async () => {
    const h = handlers()
    h.isEnabled.mockReturnValue(false)
    const session = createMcpSession(h, { name: 'd', version: '1' })
    const res = await send(session, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'list_snippets', arguments: {} }
    })
    expect(res.error.code).toBe(-32001)
    expect(h.callTool).not.toHaveBeenCalled()
    h.isEnabled.mockReturnValue(true)
    const again = await send(session, { jsonrpc: '2.0', id: 6, method: 'tools/list' })
    expect(again.result.tools).toHaveLength(1)
  })

  it('still answers initialize and ping while off, so the client can say why', async () => {
    const h = handlers()
    h.isEnabled.mockReturnValue(false)
    const session = createMcpSession(h, { name: 'd', version: '1' })
    const init = await send(session, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    expect(init.result.protocolVersion).toBeTruthy()
    const ping = await send(session, { jsonrpc: '2.0', id: 2, method: 'ping' })
    expect(ping.result).toEqual({})
  })

  it('reports malformed JSON as a parse error', async () => {
    const session = createMcpSession(handlers(), { name: 'd', version: '1' })
    const res = await send(session, '{not json')
    expect(res).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' }
    })
  })

  it('rejects a message over the size cap without parsing it', async () => {
    const session = createMcpSession(handlers(), { name: 'd', version: '1' })
    const res = await send(session, 'x'.repeat(MAX_MESSAGE_BYTES + 1))
    expect(res.error.code).toBe(-32600)
  })

  it.each([
    ['an array batch', [{ jsonrpc: '2.0', id: 1, method: 'ping' }]],
    ['a wrong version', { jsonrpc: '1.0', id: 1, method: 'ping' }],
    ['a missing method', { jsonrpc: '2.0', id: 1 }],
    ['an object id', { jsonrpc: '2.0', id: {}, method: 'ping' }]
  ])('rejects %s as an invalid request', async (_label, message) => {
    const session = createMcpSession(handlers(), { name: 'd', version: '1' })
    const res = await send(session, message)
    expect(res.error.code).toBe(-32600)
  })

  it('answers an unknown method with method-not-found', async () => {
    const session = createMcpSession(handlers(), { name: 'd', version: '1' })
    const res = await send(session, { jsonrpc: '2.0', id: 7, method: 'sampling/createMessage' })
    expect(res.error.code).toBe(-32601)
  })

  it('rejects tools/call without a tool name', async () => {
    const session = createMcpSession(handlers(), { name: 'd', version: '1' })
    const res = await send(session, { jsonrpc: '2.0', id: 8, method: 'tools/call', params: {} })
    expect(res.error.code).toBe(-32602)
  })

  it('turns a throwing handler into an internal error without leaking its message', async () => {
    const h = handlers()
    h.callTool.mockRejectedValue(new Error('/Users/me/secret/path'))
    const session = createMcpSession(h, { name: 'd', version: '1' })
    const res = await send(session, {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'list_snippets', arguments: {} }
    })
    expect(res.error).toEqual({ code: -32603, message: 'Internal error' })
  })

  it('ignores a blank line', async () => {
    const session = createMcpSession(handlers(), { name: 'd', version: '1' })
    expect(await send(session, '   ')).toBeNull()
  })
})
