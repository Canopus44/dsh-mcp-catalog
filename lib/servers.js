/**
 * Server definition rules shared by every entry point: the HTTP API, the model
 * tools, catalog imports and discovery. Keeping one validator means a server
 * saved from the UI and one saved by a tool cannot diverge in shape.
 *
 * A definition is deliberately close to the `@deepseek-ai/dsh-mcp-client`
 * config so mounting is a field copy, not a translation.
 */

const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/
const SECRET_RE = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH/i
/** Placeholder kept in place of a secret value on the way out. */
export const REDACTED = '••••••'

/** @returns {string} the canonical server name used in `mcp__<name>__*` tools. */
export function normalizeName(name) {
  return String(name ?? '').trim()
}

/**
 * @param {unknown} value
 * @returns {string[]} a string array, or [] when the value is not one.
 */
function stringArray(value) {
  if (!Array.isArray(value)) return []
  return value.filter(entry => typeof entry === 'string')
}

/**
 * @param {unknown} value
 * @returns {Record<string,string>} a plain string map, dropping non-string values.
 */
function stringMap(value) {
  const out = {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') out[key] = entry
  }
  return out
}

/**
 * Validate and canonicalize one server definition.
 * @param {unknown} input candidate, usually straight from JSON.
 * @param {{now?: number, previous?: object}} [options] `previous` keeps the original createdAt.
 * @returns {{ok:true, server:object} | {ok:false, errors:string[]}}
 */
export function normalizeServer(input, options = {}) {
  const errors = []
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['server must be an object'] }
  }
  const source = /** @type {Record<string, unknown>} */ (input)
  const previous = options.previous && typeof options.previous === 'object' ? options.previous : {}
  const name = normalizeName(source.name ?? source.serverName)
  if (!NAME_RE.test(name)) errors.push('name must match [A-Za-z0-9_-]{1,32}')

  const transport = source.transport === 'streamable-http' || source.transport === 'http' ? 'streamable-http' : 'stdio'
  const server = {
    name,
    title: typeof source.title === 'string' ? source.title.slice(0, 120) : undefined,
    transport,
    enabled: source.enabled !== false,
    note: typeof source.note === 'string' ? source.note.slice(0, 500) : undefined,
    importedFrom: typeof source.importedFrom === 'string' ? source.importedFrom.slice(0, 500) : undefined,
    catalogId: typeof source.catalogId === 'string' ? source.catalogId.slice(0, 80) : undefined,
    createdAt: typeof options.previous?.createdAt === 'number' ? options.previous.createdAt : (options.now ?? Date.now()),
    updatedAt: options.now ?? Date.now(),
  }

  const env = restoreRedacted(stringMap(source.env), previous.env)
  if (Object.keys(env).length > 128) errors.push('at most 128 environment variables')
  server.env = env

  const timeout = Number(source.toolCallTimeoutMs)
  if (Number.isFinite(timeout) && timeout >= 1000 && timeout <= 600000) server.toolCallTimeoutMs = Math.trunc(timeout)

  if (transport === 'stdio') {
    const command = typeof source.command === 'string' ? source.command.trim() : ''
    if (command === '') errors.push('stdio servers need a command')
    if (command.length > 2048) errors.push('command is too long')
    if (command.includes('\u0000')) errors.push('command contains a NUL byte')
    const args = stringArray(source.args).map(arg => arg.slice(0, 4096))
    if (args.length > 64) errors.push('at most 64 arguments')
    if (typeof source.cwd === 'string' && source.cwd !== '') server.cwd = source.cwd.slice(0, 1024)
    server.command = command
    server.args = args
  } else {
    const url = typeof source.url === 'string' ? source.url.trim() : ''
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      errors.push('streamable-http servers need a valid URL')
    }
    if (parsed && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') errors.push('URL must use http or https')
    if (parsed && parsed.username !== '') errors.push('put credentials in headers, not in the URL')
    const headers = restoreRedacted(stringMap(source.headers), previous.headers)
    if (Object.keys(headers).length > 64) errors.push('at most 64 headers')
    server.url = url
    server.headers = headers
  }

  if (errors.length > 0) return { ok: false, errors }
  const unresolved = placeholdersOf(server)
  if (unresolved.length > 0) errors.push(`replace placeholder(s) before saving: ${unresolved.join(', ')}`)
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, server }
}

/**
 * Fill `{{NAME}}` references from the definition's own env map.
 * Secrets stay in env; args and headers may point at them instead of
 * duplicating a token into a second field.
 * @param {object} server stored definition.
 * @returns {object} a copy with references resolved where possible.
 */
export function expandServer(server) {
  const env = { ...(server.env ?? {}) }
  const resolve = (value, depth = 0) => {
    if (typeof value !== 'string' || depth > 5) return value
    return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
      const replacement = env[key]
      if (typeof replacement !== 'string' || replacement === '') return match
      return resolve(replacement, depth + 1)
    })
  }
  const expanded = { ...server }
  if (expanded.transport === 'streamable-http') {
    expanded.url = resolve(expanded.url)
    const headers = {}
    for (const [key, value] of Object.entries(expanded.headers ?? {})) headers[key] = resolve(value)
    expanded.headers = headers
  } else {
    expanded.args = (expanded.args ?? []).map(arg => resolve(arg))
    const nextEnv = {}
    for (const [key, value] of Object.entries(env)) nextEnv[key] = resolve(value)
    expanded.env = nextEnv
  }
  return expanded
}

/**
 * Redact values whose key looks secret, so the UI and model tools can show a
 * definition without leaking the token that makes it work.
 * @param {Record<string,string>} env
 * @returns {Record<string,string>} same keys, secret values replaced.
 */
function restoreRedacted(map, previous) {
  const out = {}
  for (const [key, value] of Object.entries(map)) {
    out[key] = value === REDACTED && typeof previous?.[key] === 'string' ? previous[key] : value
  }
  return out
}

export function redactEnv(env) {
  const out = {}
  for (const [key, value] of Object.entries(env ?? {})) {
    out[key] = SECRET_RE.test(key) && value !== '' ? REDACTED : value
  }
  return out
}

/**
 * @param {object} server
 * @returns {object} a copy safe to publish over HTTP or to the model.
 */
export function publicServer(server) {
  return {
    ...server,
    env: redactEnv(server.env),
    headers: redactEnv(server.headers),
  }
}

/**
 * @param {object} server
 * @returns {string} identity of the connection, used to spot duplicates across sources.
 */
export function serverSignature(server) {
  if (!server || typeof server !== 'object') return ''
  if (server.transport === 'streamable-http') return `http:${String(server.url ?? '').replace(/\/+$/, '')}`
  return `stdio:${server.command ?? ''}\u0000${(server.args ?? []).join('\u0000')}`
}

/**
 * Build the config the MCP client expects from a stored definition.
 * @param {object} server
 * @returns {Record<string, unknown>} config for `@deepseek-ai/dsh-mcp-client`.
 */
export function mcpClientConfig(server) {
  const resolved = expandServer(server)
  const config = {
    serverName: resolved.name,
    transport: resolved.transport,
    failOnStartupError: false,
  }
  if (resolved.toolCallTimeoutMs !== undefined) config.toolCallTimeoutMs = resolved.toolCallTimeoutMs
  if (resolved.transport === 'streamable-http') {
    config.url = resolved.url
    if (resolved.headers && Object.keys(resolved.headers).length > 0) config.headers = resolved.headers
  } else {
    config.command = resolved.command
    if (resolved.args && resolved.args.length > 0) config.args = resolved.args
    if (resolved.env && Object.keys(resolved.env).length > 0) config.env = resolved.env
    if (resolved.cwd) config.cwd = resolved.cwd
  }
  return config
}

/**
 * Placeholder names that the definition's env map does not satisfy, so saving
 * stops until a human fills them in.
 * @param {object} server definition whose placeholders may remain.
 * @returns {string[]} distinct unresolved placeholder names, in first-seen order.
 */
export function placeholdersOf(server) {
  const env = server.env ?? {}
  const found = new Set()
  const scan = value => {
    if (typeof value !== 'string') return
    for (const match of value.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)) {
      if (typeof env[match[1]] !== 'string' || env[match[1]] === '') found.add(match[1])
    }
  }
  if (server.transport === 'streamable-http') {
    scan(server.url)
    for (const value of Object.values(server.headers ?? {})) scan(value)
  } else {
    for (const arg of server.args ?? []) scan(arg)
    for (const [key, value] of Object.entries(env)) if (value !== `{{${key}}}`) scan(value)
  }
  return [...found]
}
