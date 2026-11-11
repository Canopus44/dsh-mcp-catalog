/**
 * Model-facing tools. They are the same operations the panel offers, so the
 * assistant can search the catalog, list what is mounted, and install a server
 * without asking the user to click through the page.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { loadCatalog, searchCatalog } from './catalog.js'
import { discover, discoverDshRows } from './discovery.js'
import { inspectUrl } from './inspect.js'
import { normalizeServer, publicServer } from './servers.js'

const textOutput = {
  schema: { type: 'json' },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

/**
 * @param {{ctx: any, manager: any}} deps
 * @returns {object[]} tool definitions ready for `ctx.tools.register`.
 */
export function createTools({ ctx, manager }) {
  return [
    defineTool({
      name: 'mcp_catalog_search',
      description: 'Search the curated MCP server catalog bundled with the MCP Catalog plugin. Returns server ids with transport, package, install hints and localized descriptions. Use before mcp_catalog_install so you install a real package instead of guessing one; a remote entry may need a personal access token in its env.',
      parameters: {
        query: { type: 'string', description: 'Words to match against name, description, package and tags. Omit to list everything.' },
        category: { type: 'string', description: 'One catalog category id: development, databases, browser, cloud, productivity or search.' },
        locale: { type: 'string', description: 'Language for the description text: en, es or zh. Defaults to en.' },
        limit: { type: 'number', description: 'Maximum entries to return, 1-200. Defaults to 100.' },
      },
      output: textOutput,
      async execute(args) {
        const catalog = await loadCatalog()
        const entries = searchCatalog(catalog, { q: args.query, category: args.category, locale: args.locale, limit: args.limit })
        return entries.map(entry => ({
          id: entry.id,
          name: entry.name,
          title: entry.titleText,
          description: entry.descriptionText,
          categories: entry.categories,
          transport: entry.transport,
          package: entry.verified?.package,
          homepage: entry.homepage,
          note: entry.noteText,
        }))
      },
    }),

    defineTool({
      name: 'mcp_catalog_status',
      description: 'List the MCP servers this plugin has installed, with each one\'s connection phase and the tool names it currently publishes. Use it to check whether a server is actually connected before calling its tools.',
      parameters: {},
      output: textOutput,
      async execute() {
        const servers = manager.list()
        return {
          servers: servers.map(server => ({
            name: server.name,
            transport: server.transport,
            enabled: server.enabled,
            phase: server.status?.phase,
            tools: server.status?.tools ?? [],
            error: server.status?.error,
            command: server.command,
            url: server.url,
          })),
          mountedTools: manager.mountedTools(),
        }
      },
    }),

    defineTool({
      name: 'mcp_catalog_install',
      description: 'Install and mount one MCP server through the MCP Catalog plugin. Provide a stdio server as command plus args, or a remote server as url plus optional headers. Names must be unique. The server starts in the background; call mcp_catalog_status to see when its tools appear.',
      parameters: {
        name: { type: 'string', required: true, description: 'Server name, letters/digits/underscore/dash, max 32 chars. Its tools appear as mcp__<name>__<tool>.' },
        transport: { type: 'string', description: 'stdio (default) or streamable-http.' },
        command: { type: 'string', description: 'Executable for a stdio server, for example npx.' },
        args: { type: 'array', items: { type: 'string' }, description: 'Arguments for a stdio server.' },
        env: { type: 'json', description: 'Object of extra environment variables for a stdio server.' },
        cwd: { type: 'string', description: 'Working directory for a stdio server.' },
        url: { type: 'string', description: 'Endpoint for a streamable-http server.' },
        headers: { type: 'json', description: 'Object of HTTP headers for a streamable-http server, such as an Authorization bearer token.' },
        enabled: { type: 'boolean', description: 'Mount immediately. Defaults to true.' },
        catalogId: { type: 'string', description: 'Catalog entry this server came from, when installing from mcp_catalog_search.' },
      },
      output: textOutput,
      async execute(args) {
        const { enabled, catalogId, ...rest } = args
        const candidate = { ...rest, enabled: enabled !== false, catalogId }
        const result = normalizeServer(candidate)
        if (!result.ok) throw new Error(`invalid server: ${result.errors.join('; ')}`)
        const server = await manager.add(result.server, { source: 'catalog', catalogId })
        return {
          server: publicServer(server),
          next: 'The server starts in the background. Call mcp_catalog_status to confirm its tools are listed before using them.',
        }
      },
    }),

    defineTool({
      name: 'mcp_catalog_remove',
      description: 'Unmount and delete one installed MCP server by name. Its tools disappear from the session.',
      parameters: {
        name: { type: 'string', required: true, description: 'Name of the installed server.' },
      },
      output: textOutput,
      async execute(args) {
        return manager.remove(args.name)
      },
    }),

    defineTool({
      name: 'mcp_catalog_toggle',
      description: 'Enable or disable an installed MCP server without deleting its definition. Disabling unmounts it and removes its tools from the session.',
      parameters: {
        name: { type: 'string', required: true, description: 'Name of the installed server.' },
        enabled: { type: 'boolean', required: true, description: 'true to mount it, false to unmount it.' },
      },
      output: textOutput,
      async execute(args) {
        return manager.setEnabled(args.name, args.enabled)
      },
    }),

    defineTool({
      name: 'mcp_catalog_discover',
      description: 'Scan this machine for MCP servers configured in other clients: Claude Code and Claude Desktop, Cursor, VS Code, Codex, Gemini CLI, OpenCode, plus MCP rows the current DSH profile already loads and project-level configs. Returns each source with importable definitions and redacted secrets. Use it to import an existing setup instead of retyping commands.',
      parameters: {},
      output: textOutput,
      async execute() {
        const { sources } = await discover({})
        return {
          sources: sources.map(source => ({
            id: source.id,
            label: source.label,
            path: source.path,
            error: source.error,
            servers: (source.servers ?? []).map(publicServer),
          })),
          dsh: discoverDshRows(ctx.loader).map(publicServer),
        }
      },
    }),

    defineTool({
      name: 'mcp_catalog_inspect',
      description: 'Read an MCP install page or GitHub repository and extract candidate server definitions (command lines and JSON config blocks). Use when the user links a page or repository that is not in the catalog. Review the result before installing anything.',
      parameters: {
        url: { type: 'string', required: true, description: 'Public https URL of a documentation page or GitHub repository.' },
      },
      output: textOutput,
      async execute(args) {
        return inspectUrl(args.url)
      },
    }),
  ]
}
