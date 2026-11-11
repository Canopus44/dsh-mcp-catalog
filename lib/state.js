/**
 * Durable state for the marketplace: the servers this plugin owns and the
 * settings that shape discovery. The file lives under the Harness home
 * (`$DSH_HOME/mcp-market/servers.json`, mode 0600) because it holds command
 * lines and, when a server needs one, an API token.
 *
 * Writes are serialized and atomic (temp file + rename) so a crash never
 * leaves half a catalog behind, and every read validates shape before use:
 * a hand-edited file degrades to an empty list instead of taking the plugin
 * down at boot.
 */

import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const VERSION = 1

/** @returns {string} the directory holding this plugin's state. */
export function stateDirectory() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh')
  return join(home, 'mcp-market')
}

/** @returns {string} absolute path of the server list. */
export function statePath() {
  return join(stateDirectory(), 'servers.json')
}

/** One empty, valid state document. */
export function emptyState() {
  return { version: VERSION, servers: [], settings: { discovery: true, extraConfigPaths: [] } }
}

/**
 * Normalize whatever the file held into a usable document.
 * @param {unknown} raw parsed JSON or undefined.
 * @returns {{version:number,servers:object[],settings:{discovery:boolean,extraConfigPaths:string[]}}}
 */
export function normalizeState(raw) {
  const base = emptyState()
  if (raw === null || typeof raw !== 'object') return base
  const servers = Array.isArray(raw.servers) ? raw.servers.filter(entry => entry && typeof entry === 'object' && typeof entry.name === 'string') : []
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {}
  return {
    version: VERSION,
    servers,
    settings: {
      discovery: settings.discovery !== false,
      extraConfigPaths: Array.isArray(settings.extraConfigPaths) ? settings.extraConfigPaths.filter(path => typeof path === 'string') : [],
    },
  }
}

/**
 * Read the state file, falling back to an empty document when it is missing or
 * unreadable. A corrupt file is reported, not thrown: the caller still gets a
 * usable catalog and the user can repair the file from the UI.
 * @param {string} [path] override for tests.
 * @returns {Promise<{state:ReturnType<typeof emptyState>, error?:string}>}
 */
export async function loadState(path = statePath()) {
  try {
    const text = await readFile(path, 'utf8')
    return { state: normalizeState(JSON.parse(text)) }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { state: emptyState() }
    return { state: emptyState(), error: `state file unreadable: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** Serialize writes per path so two UI actions cannot interleave. */
const writeQueues = new Map()

/**
 * Persist the state atomically.
 * @param {{servers:object[],settings:object}} state document to write.
 * @param {string} [path] override for tests.
 * @returns {Promise<void>}
 */
export async function saveState(state, path = statePath()) {
  const previous = writeQueues.get(path) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(async () => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    const temp = `${path}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temp, `${JSON.stringify({ version: VERSION, ...state }, null, 2)}\n`, { mode: 0o600 })
    await chmod(temp, 0o600)
    await rename(temp, path)
  })
  writeQueues.set(path, next)
  try {
    await next
  } finally {
    if (writeQueues.get(path) === next) writeQueues.delete(path)
  }
}
