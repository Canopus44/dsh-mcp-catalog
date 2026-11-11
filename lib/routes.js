/**
 * HTTP surface for the browser half.
 *
 * These routes live under the harness connection channel, so only an owner
 * peer can reach them. The marker header and origin check on top guard against
 * a page from another origin driving this plugin through the user's browser.
 */

import { loadCatalog, searchCatalog } from './catalog.js'
import { discover, discoverDshRows } from './discovery.js'
import { inspectUrl } from './inspect.js'

export const PREFIX = '/api/dsh-mcp-catalog'
const MARKER = 'x-dsh-mcp-catalog'
const MAX_BODY = 512 * 1024

/**
 * @param {{ctx: any, manager: any, version: string}} deps
 * @returns {Array<{path: string, methods: string[], requestBody: string, fetch: (request: Request) => Promise<Response>}>}
 */
export function createRoutes({ ctx, manager, version }) {
  const route = (method, path, handler) => ({
    path: PREFIX + path,
    methods: [method],
    requestBody: 'buffered',
    fetch: request => respond(request, handler, { method }),
  })

  return [
    route('GET', '/state', async () => {
      const catalog = await loadCatalog()
      return json({
        version,
        servers: manager.list(),
        catalog: {
          count: catalog.entries.length,
          updatedAt: catalog.updatedAt,
          categories: catalog.categories,
        },
      })
    }),

    route('GET', '/catalog', async request => {
      const catalog = await loadCatalog()
      const url = new URL(request.url)
      const locale = url.searchParams.get('locale') ?? 'en'
      const entries = searchCatalog(catalog, {
        q: url.searchParams.get('q') ?? '',
        category: url.searchParams.get('category') ?? '',
        locale,
        limit: url.searchParams.get('limit') ?? undefined,
      })
      return json({ updatedAt: catalog.updatedAt, categories: catalog.categories, servers: entries })
    }),

    route('GET', '/discover', async request => {
      const url = new URL(request.url)
      const extra = url.searchParams.get('path')
      const result = await discover(extra ? { extraPaths: [extra] } : {})
      return json({
        sources: result.sources,
        dsh: discoverDshRows(ctx.loader),
      })
    }),

    route('POST', '/inspect', async (request, body) => {
      const url = String(body.url ?? '').trim()
      if (url === '') throw new HttpError(400, 'field "url" is required')
      return json(await inspectUrl(url))
    }),

    route('POST', '/servers', async (request, body) => {
      const candidate = body.server
      if (!candidate || typeof candidate !== 'object') throw new HttpError(400, 'field "server" is required')
      const server = await manager.add(candidate, { source: body.source, catalogId: candidate.catalogId })
      return json({ server }, 201)
    }),

    route('POST', '/server/update', async (request, body) => {
      const name = requireName(body)
      const patch = body.patch
      if (!patch || typeof patch !== 'object') throw new HttpError(400, 'field "patch" is required')
      return json({ server: await manager.update(name, patch) })
    }),

    route('POST', '/server/toggle', async (request, body) => {
      const name = requireName(body)
      if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'field "enabled" must be a boolean')
      return json({ server: await manager.setEnabled(name, body.enabled) })
    }),

    route('POST', '/server/remove', async (request, body) => {
      const name = requireName(body)
      return json(await manager.remove(name))
    }),

    route('POST', '/server/reconnect', async (request, body) => {
      const name = requireName(body)
      return json({ server: await manager.reconnect(name) })
    }),
  ]

  /** @param {any} body @returns {string} */
  function requireName(body) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (name === '') throw new HttpError(400, 'field "name" is required')
    return name
  }

  /**
   * @param {Request} request
   * @param {(request: Request, body: any) => Promise<Response>} handler
   * @param {{method: string}} meta
   */
  async function respond(request, handler, meta) {
    try {
      let body = {}
      if (meta.method === 'POST') {
        assertSameOrigin(request)
        if (request.headers.get(MARKER) !== '1') throw new HttpError(403, `missing ${MARKER} header`)
        body = await readJson(request)
      }
      return await handler(request, body)
    } catch (error) {
      return failure(error)
    }
  }
}

/** @param {Request} request */
function assertSameOrigin(request) {
  const origin = request.headers.get('origin')
  if (!origin || origin === 'null') return
  let host
  try {
    host = new URL(origin).host
  } catch {
    throw new HttpError(403, 'invalid origin')
  }
  if (host !== new URL(request.url).host) throw new HttpError(403, 'cross-origin request rejected')
}

/** @param {Request} request @returns {Promise<any>} */
async function readJson(request) {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY) throw new HttpError(413, 'request body is too large')
  const text = await request.text()
  if (text.length > MAX_BODY) throw new HttpError(413, 'request body is too large')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'request body is not valid JSON')
  }
}

/** @param {unknown} value @param {number} [status] */
export function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/** @param {unknown} error */
function failure(error) {
  const status = error instanceof HttpError
    ? error.statusCode
    : error && typeof error === 'object' && 'statusCode' in error
      ? Number(error.statusCode) || 500
      : 500
  const payload = { error: error instanceof Error ? error.message : String(error) }
  if (error && typeof error === 'object' && Array.isArray(error.errors)) payload.errors = error.errors
  return json(payload, status)
}

export class HttpError extends Error {
  /** @param {number} statusCode @param {string} message */
  constructor(statusCode, message) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
  }
}
