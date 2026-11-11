/**
 * Owns the live side of the catalog: which MCP servers are mounted right now.
 *
 * The MCP client ships as a Cordis plugin, so the manager does not speak the
 * protocol itself. It mounts one child plugin per enabled server and disposes
 * it to unmount. That keeps this bundle independent of the MCP client's
 * internals and removes the need to edit the profile's Loader rows.
 */

import { mcpClientConfig, normalizeServer, publicServer } from './servers.js'
import { loadState, saveState } from './state.js'

const START_TIMEOUT_MS = 20000

/** @typedef {{state: number, dispose: () => Promise<void>, await: () => Promise<any>}} FiberLike */

/** @returns {Promise<any>} the MCP client plugin namespace. */
let modulePromise

async function mcpClientModule() {
  modulePromise ??= import('@deepseek-ai/dsh-mcp-client')
  return modulePromise
}

/** @param {number} state cordis FiberState. */
function stateLabel(state) {
  return ['pending', 'loading', 'active', 'failed', 'disposed', 'unloading'][state] ?? 'unknown'
}

export class ServerManager {
  /**
   * @param {any} ctx host context.
   * @param {{file?: string, log?: (message: string) => void}} [options]
   */
  constructor(ctx, options = {}) {
    this.ctx = ctx
    this.log = options.log ?? (() => {})
    this.stateFile = options.file
    /** @type {{version: number, servers: object[]}} */
    this.state = { version: 1, servers: [] }
    /** @type {Map<string, FiberLike|string>} mounted child fibers, or loader row ids. */
    this.children = new Map()
    /** @type {Map<string, string>} last mount error per server name. */
    this.errors = new Map()
    this.queue = Promise.resolve()
    this.disposed = false
  }

  /** Read stored definitions from disk. Safe to call once at startup. */
  async load() {
    const { state, error } = await loadState(this.stateFile)
    if (error) this.log(`state: ${error}`)
    this.state = state
    return state
  }

  /** @returns {object[]} stored definitions with their live status. */
  list() {
    return this.state.servers.map(server => publicServer({
      ...server,
      status: this.status(server.name),
    }))
  }

  /** @param {string} name */
  find(name) {
    return this.state.servers.find(server => server.name === name)
  }

  /**
   * What the UI needs to show for one server: process state, tools, error.
   * @param {string} name
   */
  status(name) {
    const fiber = this.children.get(name)
    const tools = this.toolsOf(name)
    if (fiber === undefined) {
      return { mounted: false, phase: 'stopped', tools, error: this.errors.get(name) }
    }
    if (typeof fiber === 'string') {
      return { mounted: true, phase: 'attached', tools, error: this.errors.get(name) }
    }
    return { mounted: true, phase: stateLabel(fiber.state), tools, error: this.errors.get(name) }
  }

  /** @param {string} name @returns {string[]} tool names published by this server. */
  toolsOf(name) {
    const prefix = `mcp__${name}__`
    try {
      const schemas = this.ctx.tools?.schemas?.() ?? []
      return schemas.map(schema => schema.name).filter(tool => tool.startsWith(prefix)).sort()
    } catch {
      return []
    }
  }

  /** Every tool name currently published by this catalog's servers. */
  mountedTools() {
    const names = []
    for (const server of this.state.servers) names.push(...this.toolsOf(server.name))
    return names
  }

  /**
   * Save then (un)mount, serialized so two clicks cannot race the same name.
   * @param {() => Promise<any>} work
   */
  enqueue(work) {
    const next = this.queue.then(work, work)
    this.queue = next.catch(() => {})
    return next
  }

  /**
   * @param {object} candidate raw definition from the UI, a tool or a catalog entry.
   * @param {{source?: string, catalogId?: string, importedFrom?: string, mountNow?: boolean}} [meta]
   */
  add(candidate, meta = {}) {
    return this.enqueue(async () => {
      const result = normalizeServer({
        ...candidate,
        catalogId: meta.catalogId ?? candidate.catalogId,
        importedFrom: meta.importedFrom ?? candidate.importedFrom,
        importedFromLabel: meta.source ?? candidate.importedFromLabel,
      })
      if (!result.ok) throw new ValidationError(result.errors)
      const server = result.server
      if (this.find(server.name)) throw new ValidationError([`a server named "${server.name}" already exists`])
      this.state.servers.push(server)
      await this.persist()
      if (server.enabled) this.mount(server.name)
      return publicServer({ ...server, status: this.status(server.name) })
    })
  }

  /**
   * @param {string} name
   * @param {object} patch partial definition; `name` cannot change.
   */
  update(name, patch) {
    return this.enqueue(async () => {
      const previous = this.find(name)
      if (!previous) throw new NotFoundError(name)
      const result = normalizeServer({ ...previous, ...patch, name }, { previous })
      if (!result.ok) throw new ValidationError(result.errors)
      const server = result.server
      const index = this.state.servers.indexOf(previous)
      this.state.servers[index] = server
      await this.persist()
      if (server.enabled) this.remount(server.name)
      else this.unmount(server.name)
      return publicServer({ ...server, status: this.status(server.name) })
    })
  }

  /** @param {string} name @param {boolean} enabled */
  setEnabled(name, enabled) {
    return this.update(name, { enabled: Boolean(enabled) })
  }

  /** @param {string} name @returns {Promise<object>} */
  remove(name) {
    return this.enqueue(async () => {
      const server = this.find(name)
      if (!server) throw new NotFoundError(name)
      await this.unmount(name)
      this.state.servers = this.state.servers.filter(entry => entry !== server)
      this.errors.delete(name)
      await this.persist()
      return { name, removed: true }
    })
  }

  /** Dispose and mount again, to retry a failed connection. */
  reconnect(name) {
    return this.enqueue(async () => {
      const server = this.find(name)
      if (!server) throw new NotFoundError(name)
      await this.unmount(name)
      this.errors.delete(name)
      if (server.enabled) this.mount(name)
      return publicServer({ ...server, status: this.status(name) })
    })
  }

  /**
   * Mount one stored server. Runs in the background: a first `npx` download can
   * take a minute, and blocking the HTTP request on it would just time out.
   * @param {string} name
   */
  mount(name) {
    const server = this.find(name)
    if (!server || this.children.has(name) || this.disposed) return
    this.errors.delete(name)
    void this.mountInner(server)
      .then(child => {
        if (this.disposed || !this.find(name)) {
          void this.disposeChild(child)
          return
        }
        this.children.set(name, child)
      })
      .catch(error => {
        this.errors.set(name, describe(error))
        this.log(`mount ${name}: ${describe(error)}`)
      })
  }

  /** @param {object} server @returns {Promise<FiberLike|string>} */
  async mountInner(server) {
    const config = mcpClientConfig(server)
    // The Loader owns package resolution for this profile, so a row it creates
    // can import the shipped MCP client even when this bundle is linked from
    // outside the profile and plain Node cannot resolve @deepseek-ai/*.
    if (this.ctx.loader && typeof this.ctx.loader.create === 'function') {
      return this.createLoaderRow(server, config, 0)
    }
    return this.mountChild(server, config)
  }

  /**
   * @param {object} server @param {object} config @param {number} attempt
   * @returns {Promise<string>} a `loader:<row id>` handle.
   */
  async createLoaderRow(server, config, attempt) {
    const id = `mcp-catalog-${server.name}`
    try {
      const created = await this.ctx.loader.create({ id, name: '@deepseek-ai/dsh-mcp-client', config })
      return `loader:${typeof created === 'string' ? created : id}`
    } catch (error) {
      const message = describe(error)
      // A row left behind by a previous process or a failed mount owns the id.
      if (attempt === 0 && /already exists|duplicate|conflict/i.test(message)) {
        try {
          await this.ctx.loader.remove?.(id)
        } catch {
          // Removing a stale row that is not there is fine.
        }
        return this.createLoaderRow(server, config, 1)
      }
      throw error
    }
  }

  /**
   * Fallback for hosts without a Loader service: mount the MCP client package
   * directly as a child plugin.
   * @param {object} server @param {object} config @returns {Promise<FiberLike>}
   */
  async mountChild(server, config) {
    const namespace = await mcpClientModule()
    const plugin = namespace.default && typeof namespace.default.apply === 'function' ? namespace.default : namespace
    if (typeof plugin.apply !== 'function') throw new Error('the MCP client package does not export an apply() function')
    const validated = typeof plugin.Config === 'function' ? plugin.Config(config) : config
    const fiber = this.ctx.plugin(plugin, validated)
    let timer
    try {
      const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`did not finish starting within ${START_TIMEOUT_MS / 1000}s`)), START_TIMEOUT_MS)
        timer.unref?.()
      })
      await Promise.race([fiber.await(), timeout])
    } catch (error) {
      // A server that is slow or unreachable still keeps its fiber; the
      // client reconnects on its own and the tools appear when it does.
      this.errors.set(server.name, describe(error))
    } finally {
      clearTimeout(timer)
    }
    return fiber
  }

  /** @param {string} name */
  async unmount(name) {
    const child = this.children.get(name)
    this.children.delete(name)
    if (child !== undefined) await this.disposeChild(child)
  }

  /** @param {FiberLike|string} child */
  async disposeChild(child) {
    try {
      if (typeof child === 'string') {
        const id = child.startsWith('loader:') ? child.slice(7) : child
        await this.ctx.loader?.remove?.(id)
        return
      }
      await child.dispose()
    } catch (error) {
      this.log(`unmount: ${describe(error)}`)
    }
  }

  /** Start every enabled server. */
  async start() {
    for (const server of this.state.servers) {
      if (server.enabled) this.mount(server.name)
    }
  }

  /** Stop everything and persist nothing; the state already reflects intent. */
  async dispose() {
    this.disposed = true
    const names = [...this.children.keys()]
    for (const name of names) await this.unmount(name)
  }

  async persist() {
    const { error } = await saveState(this.state, this.stateFile)
    if (error) this.log(`state: ${error}`)
  }
}

export class ValidationError extends Error {
  /** @param {string[]} errors */
  constructor(errors) {
    super(errors.join('; '))
    this.name = 'ValidationError'
    this.errors = errors
    this.statusCode = 400
  }
}

export class NotFoundError extends Error {
  /** @param {string} name */
  constructor(name) {
    super(`no server named "${name}"`)
    this.name = 'NotFoundError'
    this.statusCode = 404
  }
}

/** @param {unknown} error @returns {string} */
export function describe(error) {
  if (error instanceof Error) return error.message
  return String(error)
}
