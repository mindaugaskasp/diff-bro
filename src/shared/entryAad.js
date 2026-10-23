// Shared by the renderer stores and the MCP reader: any drift between them reads as tamper.

export const snippetAad = (id, aadSalt, createdAt) => [id, aadSalt, createdAt].join('|')

export const diffAad = (id, createdAt, expiresAt, from) =>
  [id, createdAt, expiresAt, from ?? ''].join('|')
