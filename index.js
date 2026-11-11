/**
 * MCP Catalog: discover MCP servers on this machine, import them, browse a
 * curated catalog and mount servers live through the shipped MCP client.
 *
 * The host half owns the state file and the mounted connections; the browser
 * half is a panel under Plugins and talks to these routes.
 */

import { readFile } from 'node:fs/promises'
import { createRoutes } from './lib/routes.js'
import { createTools } from './lib/tools.js'
import { ServerManager } from './lib/market.js'

export const name = 'mcp-catalog'
export const inject = ['tools', 'connection']

/** @param {any} ctx @param {{autoStart?: boolean, stateFile?: string, extraSources?: string[]}} [config] */
export async function apply(ctx, config) {
  const settings = {
    autoStart: config?.autoStart !== false,
    stateFile: typeof config?.stateFile === 'string' ? config.stateFile : '',
    extraSources: Array.isArray(config?.extraSources) ? config.extraSources : [],
  }
  const version = await readVersion()
  const manager = new ServerManager(ctx, {
    file: settings.stateFile === '' ? undefined : settings.stateFile,
    log: message => ctx.logger?.warn?.(`mcp-catalog: ${message}`),
  })
  await manager.load()

  ctx.effect(() => {
    return () => {
      void manager.dispose()
    }
  }, 'mcp-catalog: live servers')

  const routes = createRoutes({ ctx, manager, version })
  ctx.effect(() => {
    const disposers = routes.map(route => ctx.connection.fetch.register(route))
    return () => {
      for (const dispose of disposers) {
        try {
          const result = dispose()
          if (result && typeof result.catch === 'function') result.catch(() => {})
        } catch (error) {
          ctx.logger?.warn?.(`mcp-catalog: route cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }, 'mcp-catalog: HTTP routes')

  const tools = createTools({ ctx, manager })
  ctx.effect(() => {
    const disposers = tools.map(tool => ctx.tools.register(tool))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'mcp-catalog: model tools')

  if (settings.autoStart) {
    // Mount in the background: a first npx download must not delay plugin
    // readiness or the page load that follows it.
    setTimeout(() => {
      void manager.start().catch(error => ctx.logger?.warn?.(`mcp-catalog: start failed: ${error instanceof Error ? error.message : String(error)}`))
    }, 0)
  }

  ctx.logger?.info?.(`mcp-catalog: ${manager.list().length} server(s), ${routes.length} routes, ${tools.length} tools`)
}

/** @returns {Promise<string>} the package version, for the panel footer. */
async function readVersion() {
  try {
    const text = await readFile(new URL('./package.json', import.meta.url), 'utf8')
    return String(JSON.parse(text).version ?? '0.0.0')
  } catch {
    return '0.0.0'
  }
}
