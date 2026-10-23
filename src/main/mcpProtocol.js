// Hand-rolled: the MCP SDK ships an HTTP stack and 17 runtime dependencies (rule 2).

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
export const MAX_MESSAGE_BYTES = 2 * 1024 * 1024

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603
const RESOURCE_NOT_FOUND = -32002
export const CONNECTION_OFF = -32001

class RpcError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const reply = (id, result) => ({ jsonrpc: '2.0', id, result })
const failure = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })

const isValidId = (id) => id === undefined || typeof id === 'string' || typeof id === 'number'

const isRequestShape = (msg) =>
  msg !== null &&
  typeof msg === 'object' &&
  !Array.isArray(msg) &&
  msg.jsonrpc === '2.0' &&
  typeof msg.method === 'string' &&
  isValidId(msg.id)

function requireString(value, name) {
  if (typeof value !== 'string' || !value) throw new RpcError(INVALID_PARAMS, `${name} is required`)
  return value
}

/** Methods that answer while the connection is off, so a client can report why. */
const ALWAYS_OPEN = new Set(['initialize', 'ping'])

const methodsFor = (handlers, serverInfo) => ({
  initialize: (params) => ({
    protocolVersion: PROTOCOL_VERSIONS.includes(params?.protocolVersion)
      ? params.protocolVersion
      : PROTOCOL_VERSIONS[0],
    capabilities: { tools: {}, resources: {} },
    serverInfo
  }),
  ping: () => ({}),
  'tools/list': () => ({ tools: handlers.listTools() }),
  'tools/call': (params) =>
    handlers.callTool(requireString(params?.name, 'name'), params?.arguments ?? {}),
  'resources/list': () => ({ resources: handlers.listResources() }),
  'resources/read': async (params) => {
    const result = await handlers.readResource(requireString(params?.uri, 'uri'))
    if (!result) throw new RpcError(RESOURCE_NOT_FOUND, 'Resource not found')
    return result
  }
})

/**
 * @param {{
 *   isEnabled: () => boolean,
 *   listTools: () => object[],
 *   callTool: (name: string, args: object) => Promise<object>,
 *   listResources: () => object[],
 *   readResource: (uri: string) => Promise<object|null>
 * }} handlers
 * @param {{ name: string, version: string }} serverInfo
 */
export function createMcpSession(handlers, serverInfo) {
  const methods = methodsFor(handlers, serverInfo)

  async function dispatch(msg) {
    const method = methods[msg.method]
    if (!method) throw new RpcError(METHOD_NOT_FOUND, 'Method not found')
    if (!ALWAYS_OPEN.has(msg.method) && !handlers.isEnabled()) {
      throw new RpcError(CONNECTION_OFF, 'The Claude connection is turned off in DiffBro Settings')
    }
    return method(msg.params)
  }

  async function answer(msg) {
    try {
      const result = await dispatch(msg)
      return msg.id === undefined ? null : reply(msg.id, result)
    } catch (err) {
      if (msg.id === undefined) return null
      if (err instanceof RpcError) return failure(msg.id, err.code, err.message)
      return failure(msg.id, INTERNAL_ERROR, 'Internal error')
    }
  }

  /**
   * @param {string} line  one newline-delimited message
   * @returns {Promise<object|null>} the response, or null when none is owed
   */
  async function handleLine(line) {
    if (!line.trim()) return null
    if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES) {
      return failure(null, INVALID_REQUEST, 'Message too large')
    }
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return failure(null, PARSE_ERROR, 'Parse error')
    }
    if (!isRequestShape(msg)) return failure(null, INVALID_REQUEST, 'Invalid request')
    return answer(msg)
  }

  return { handleLine }
}
