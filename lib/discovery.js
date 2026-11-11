/**
 * Find MCP servers that already exist outside this plugin: the DSH profile,
 * Claude Code, Claude Desktop, Cursor, VS Code, Codex, Gemini CLI, OpenCode
 * and the project in the current working directory.
 *
 * Everything here is read-only and best-effort. A malformed config in another
 * tool must not break discovery, so each source resolves independently and
 * reports its own error.
 */

import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Config files understood out of the box, in reading order. */
export function defaultSources() {
  const home = homedir()
  return [
    { id: 'claude-code', label: 'Claude Code', path: join(home, '.claude.json'), format: 'claude' },
    { id: 'claude-desktop', label: 'Claude Desktop', path: join(home, '.config', 'Claude', 'claude_desktop_config.json'), format: 'claude' },
    { id: 'cursor', label: 'Cursor', path: join(home, '.cursor', 'mcp.json'), format: 'claude' },
    { id: 'vscode', label: 'VS Code', path: join(home, '.config', 'Code', 'User', 'mcp.json'), format: 'vscode' },
    { id: 'codex', label: 'Codex', path: join(home, '.codex', 'config.toml'), format: 'toml' },
    { id: 'gemini', label: 'Gemini CLI', path: join(home, '.gemini', 'settings.json'), format: 'claude' },
    { id: 'opencode', label: 'OpenCode', path: join(home, '.config', 'opencode', 'opencode.jsonc'), format: 'opencode' },
  ]
}

/** Project-local configs, resolved against the host process working directory. */
export function projectSources(cwd = process.cwd()) {
  return [
    { id: 'project-claude', label: 'Project (.mcp.json)', path: join(cwd, '.mcp.json'), format: 'claude' },
    { id: 'project-vscode', label: 'Project (.vscode/mcp.json)', path: join(cwd, '.vscode', 'mcp.json'), format: 'vscode' },
    { id: 'project-opencode', label: 'Project (opencode)', path: join(cwd, 'opencode.jsonc'), format: 'opencode' },
  ]
}

/**
 * Remove `//` and `/* *\/` comments outside strings, then trailing commas.
 * @param {string} text
 * @returns {string} JSON-parseable text.
 */
export function stripJsonc(text) {
  let out = ''
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (inString) {
      out += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      out += char
      continue
    }
    if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') index += 1
      out += '\n'
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
      index += 1
      continue
    }
    out += char
  }
  return out.replace(/,\s*([}\]])/g, '$1')
}

/**
 * Parse a JSON-with-comments file.
 * @param {string} text
 * @returns {unknown}
 */
export function parseJsonc(text) {
  return JSON.parse(stripJsonc(text))
}

/**
 * Minimal TOML reader for the parts MCP configs use: `[mcp_servers.NAME]`
 * tables with scalar strings, string arrays and inline tables.
 * @param {string} text
 * @returns {Record<string, any>}
 */
export function parseTomlMcp(text) {
  /** @type {Record<string, any>} */
  const servers = {}
  let current
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s+|\s+$/g, '')
    if (line === '' || line.startsWith('#')) continue
    const header = /^\[([^\]]+)\]$/.exec(line)
    if (header) {
      const parts = header[1].split('.').map(part => part.replace(/^"|"$/g, '').trim())
      if (parts[0] !== 'mcp_servers' || parts.length < 2) {
        current = undefined
        continue
      }
      const name = parts[1]
      servers[name] ??= {}
      current = parts.length >= 3 && parts[2] === 'env' ? (servers[name].env ??= {}) : servers[name]
      continue
    }
    if (!current) continue
    const assignment = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line)
    if (!assignment) continue
    const key = assignment[1]
    const value = parseTomlValue(assignment[2])
    if (value !== undefined) current[key] = value
  }
  return servers
}

/**
 * @param {string} raw right-hand side of a TOML assignment.
 * @returns {unknown}
 */
function parseTomlValue(raw) {
  const value = raw.replace(/\s+#.*$/, '').trim()
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1)
    const items = []
    const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'/g
    let match
    while ((match = re.exec(inner))) items.push(unescapeToml(match[1] ?? match[2] ?? ''))
    return items
  }
  if (value.startsWith('{') && value.endsWith('}')) {
    const out = {}
    const re = /([A-Za-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/g
    let match
    while ((match = re.exec(value))) out[match[1]] = unescapeToml(match[2] ?? match[3] ?? '')
    return out
  }
  if (value.startsWith('"') && value.endsWith('"')) return unescapeToml(value.slice(1, -1))
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1)
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^-?\d+$/.test(value)) return Number(value)
  return undefined
}

/** @param {string} text */
function unescapeToml(text) {
  return text.replace(/\\(["\\nrt])/g, (_match, char) => ({ '"': '"', '\\': '\\', n: '\n', r: '\r', t: '\t' })[char] ?? char)
}

/**
 * @param {string} path
 * @param {string} format
 * @param {number} [sizeLimit]
 * @returns {Promise<Record<string, object>>} name → raw server entry.
 */
export async function readSource(path, format, sizeLimit = 4 * 1024 * 1024) {
  const info = await stat(path)
  if (!info.isFile()) throw new Error('not a file')
  if (info.size > sizeLimit) throw new Error('file is too large')
  const text = await readFile(path, 'utf8')
  if (format === 'toml') return parseTomlMcp(text)
  const data = parseJsonc(text)
  if (data === null || typeof data !== 'object') return {}
  const record = /** @type {Record<string, any>} */ (data)
  const table = record.mcpServers ?? record.servers ?? (record.mcp && typeof record.mcp === 'object' ? record.mcp.servers ?? record.mcp : undefined)
  if (table === null || typeof table !== 'object' || Array.isArray(table)) return {}
  /** @type {Record<string, object>} */
  const out = {}
  for (const [name, entry] of Object.entries(table)) {
    if (entry && typeof entry === 'object') out[name] = entry
  }
  return out
}

/**
 * Convert one tool-specific entry into this plugin's server shape.
 * @param {string} name raw key in the source file.
 * @param {Record<string, any>} entry
 * @returns {object|null} normalized candidate, or null when unsupported.
 */
export function convertEntry(name, entry) {
  const url = typeof entry.url === 'string' ? entry.url : typeof entry.serverUrl === 'string' ? entry.serverUrl : undefined
  const type = String(entry.type ?? entry.transport ?? '').toLowerCase()
  if (url !== undefined && (type === 'http' || type === 'remote' || type === 'sse' || type === 'streamable-http' || type === '')) {
    return {
      name,
      title: name,
      transport: 'streamable-http',
      url,
      headers: typeof entry.headers === 'object' && entry.headers !== null ? entry.headers : {},
      note: type === 'sse' ? 'SSE endpoint; the MCP client speaks streamable HTTP.' : undefined,
    }
  }
  const commandField = entry.command
  const command = Array.isArray(commandField) ? String(commandField[0] ?? '') : typeof commandField === 'string' ? commandField : ''
  if (command === '') return null
  const args = Array.isArray(commandField) ? commandField.slice(1).map(String) : Array.isArray(entry.args) ? entry.args.map(String) : []
  const env = {}
  const envSource = entry.env ?? entry.environment ?? {}
  if (envSource && typeof envSource === 'object') {
    for (const [key, value] of Object.entries(envSource)) if (typeof value === 'string') env[key] = value
  }
  if (Array.isArray(entry.env_vars)) {
    for (const key of entry.env_vars) {
      if (typeof key === 'string' && typeof process.env[key] === 'string') env[key] = process.env[key]
    }
  }
  return {
    name,
    title: name,
    transport: 'stdio',
    command,
    args,
    env,
    cwd: typeof entry.cwd === 'string' ? entry.cwd : undefined,
  }
}

/**
 * Scan every source and return what can be imported.
 * @param {{extraPaths?: string[], enabled?: boolean}} [options]
 * @returns {Promise<{sources: object[], project: object[]}>}
 */
export async function discover(options = {}) {
  const sources = [...defaultSources(), ...projectSources()]
  for (const extra of options.extraPaths ?? []) {
    if (typeof extra === 'string' && extra !== '') sources.push({ id: `extra:${extra}`, label: extra, path: extra, format: extra.endsWith('.toml') ? 'toml' : 'claude' })
  }
  const results = []
  for (const source of sources) {
    const result = { id: source.id, label: source.label, path: source.path, servers: [], error: undefined }
    try {
      const entries = await readSource(source.path, source.format)
      for (const [rawName, entry] of Object.entries(entries)) {
        const converted = convertEntry(rawName, entry)
        if (converted !== null) result.servers.push(converted)
      }
    } catch (error) {
      const code = error && error.code
      result.error = code === 'ENOENT' ? 'not found' : error instanceof Error ? error.message : String(error)
    }
    results.push(result)
  }
  return { sources: results }
}

/**
 * Describe the MCP rows the running DSH profile already mounts.
 * @param {{entries?: () => Iterable<any>}} loader the Loader service.
 * @returns {object[]} rows with the parts worth showing, env values redacted later.
 */
export function discoverDshRows(loader) {
  if (!loader || typeof loader.entries !== 'function') return []
  const rows = []
  for (const entry of loader.entries()) {
    const name = entry?.options?.name
    if (name !== '@deepseek-ai/dsh-mcp-client') continue
    const config = entry.options.config ?? {}
    rows.push({
      id: entry.options.id ?? '',
      name: typeof config.serverName === 'string' ? config.serverName : (entry.options.id ?? ''),
      transport: config.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
      command: typeof config.command === 'string' ? config.command : undefined,
      args: Array.isArray(config.args) ? config.args : [],
      env: config.env && typeof config.env === 'object' ? config.env : {},
      url: typeof config.url === 'string' ? config.url : undefined,
      headers: config.headers && typeof config.headers === 'object' ? config.headers : {},
      disabled: entry.disabled === true,
      enabled: entry.disabled !== true,
      source: 'dsh',
    })
  }
  return rows
}
