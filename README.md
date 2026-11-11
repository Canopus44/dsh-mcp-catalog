# MCP Catalog for DeepSeek Harness

MCP Catalog finds the MCP servers already configured on this machine, imports them into DeepSeek Harness, and mounts a curated list of servers as live tools in the current session. It also reads an install page or repository you point it at and shows the server definitions it can extract from it.

This is a DSH plugin bundle: a Host half that owns the server list and mounts `@deepseek-ai/dsh-mcp-client` per server, and a browser half that renders a full page with a sidebar entry.

- [Español](README.es.md)
- [中文](README.zh.md)

## What it does

| Area | Behavior |
| --- | --- |
| Installed | Lists every server this plugin manages, its connection state, and the tools it published (`mcp__<name>__*`). Connect, edit, disable, reconnect, remove. |
| Catalog | 32 curated servers across development, databases, browser and testing, cloud and DevOps, productivity, and search. Search by name, package, tag, or category. |
| Import | Reads MCP definitions from Claude Code, Claude Desktop, Cursor, VS Code, Codex, Gemini CLI, and OpenCode profiles (and their project-level equivalents), plus the rows the running DSH profile already loads. Nothing in those files is modified. |
| Page reader | Fetches a public `https` page or GitHub README, extracts `mcpServers` JSON blocks and `npx` / `uvx` / `pnpm` install lines, and offers them as candidates for review. |

Every install path ends in the same form: you review the command or URL, fill in the placeholders, and save. Nothing is mounted silently.

## Requirements

- DeepSeek Harness with plugin support (`>=0.2.2-rc.1`, declared in `dsh.engines.dsh`).
- Node.js 22 or newer for the local MCP servers you install. The plugin itself runs inside DSH.
- Network access only when you open the Catalog's page reader or a remote server; the installed list and catalog work offline.

## Install

### From a local folder (development)

```bash
# from this repository
dsh plugin --profile desktop add /absolute/path/to/dsh-mcp-catalog
```

Or in the app: Settings → Plugins → install a bundle → pick the folder. Restart DSH after replacing an already installed copy.

### From the published market index

The repository ships a market index at `docs/market/index.json`. Add it as a custom source:

1. Enable the experimental **Custom plugin markets** bundle in Settings → Plugins.
2. Open the **Discover** tab and add the source `https://canopus44.github.io/dsh-mcp-catalog/market/index.json`.
3. Install **MCP Catalog** from there.

## Using it

Open **MCP Catalog** in the sidebar. The page opens on **Installed**, which is the state that matters: what is mounted, what failed, and which tools exist right now.

- **Add server** opens the same form the catalog and the importer use. Choose a local command or a remote URL, paste environment variables one `KEY=value` per line, save.
- **Catalog → Use** pre-fills the form from a curated entry. Placeholders such as `{{FOLDER}}` or `{{DATABASE_PATH}}` must be replaced with real values, or with an environment variable of that name.
- **Import** copies a definition from another client. Point at a page to extract candidates from a README. Both routes end in the review form.
- **Remove** asks for a second click and then unmounts and deletes the definition.

A server that is `Failed` shows the transport error in place. A server whose process started but published no tools yet stays with a `Starting` dot until the MCP handshake finishes.

### Secrets and placeholders

Values whose key looks secret (`TOKEN`, `KEY`, `SECRET`, `PASSWORD`, `CREDENTIAL`, `AUTH`) are shown as `••••••` in the UI and in tool output. Saving the redacted form keeps the stored value.

A `{{NAME}}` reference in an argument, URL, or header is filled from the server's own environment map. This lets the token live in one place:

```
URL:     https://mcp.example.com/sse
Headers: Authorization: Bearer {{EXAMPLE_API_KEY}}
Env:     EXAMPLE_API_KEY=...
```

A definition with an unresolved placeholder is rejected before it is stored, so the failure appears in the form rather than at connection time.

## Configuration

The bundle row accepts these options:

| Option | Default | Meaning |
| --- | --- | --- |
| `autoStart` | `true` | Mount enabled servers when the plugin activates. |
| `stateFile` | `""` | Override the state path. Empty means `$DSH_HOME/mcp-market/servers.json`. |
| `extraSources` | `[]` | Additional MCP config files to scan in the Import tab. |

Edit them in Settings → Plugins → MCP Catalog. The plugin never rewrites the profile's `cordis.patch.yml`; its server list lives in its own state file.

## Model tools

The Host half registers seven tools, so an agent can manage servers without the panel:

| Tool | Purpose |
| --- | --- |
| `mcp_catalog_search` | Search the curated catalog. |
| `mcp_catalog_status` | List installed servers, phases, and published tools. |
| `mcp_catalog_install` | Validate and mount a definition. |
| `mcp_catalog_remove` | Unmount and delete a server. |
| `mcp_catalog_toggle` | Enable or disable a server without deleting it. |
| `mcp_catalog_discover` | Scan local client configs and DSH rows. |
| `mcp_catalog_inspect` | Read a page or repository and extract candidates. |

Tools return JSON. Definition editing is left to the panel so a model cannot silently change a command after review.

## Security notes

- The HTTP surface is seven routes under `/api/dsh-mcp-catalog`. DSH only forwards them for the owner principal; mutations additionally require the `x-dsh-mcp-catalog` header and a same-origin `Origin`.
- Environment values are stored in plain text in `$DSH_HOME/mcp-market/servers.json`, created with mode `0600`. DSH's stdio transport merges only this explicit map on top of a scrubbed parent environment, so unrelated ambient credentials are not inherited by MCP servers.
- The page reader accepts only public `https` URLs, resolves DNS and rejects private and link-local addresses, caps the response at 2 MiB, and follows at most three redirects.
- Import reads other clients' configuration files; it never writes to them.
- Remote MCP servers that require OAuth are listed with a note. DSH's MCP client speaks streamable HTTP with headers, not an OAuth flow; use a token header or bridge the server through `mcp-remote` when it only supports OAuth.

## Development

```bash
npm test        # unit tests (node:test)
npm run check   # manifest, exports, locale, icon, catalog, index, syntax
```

Layout:

```
index.js              Host entry: config, routes, tools, lifecycle
lib/                  state, servers, catalog, discovery, market, routes, tools, inspect
client/client.js      Panel UI (module loader bundle, React from module table)
data/catalog.json     Curated servers, trilingual
docs/market/          Published market index and icons
scripts/check.mjs     Release checks
test/                 Unit tests
```

The panel uses only host theme tokens and copies no UI primitives. Server state is serialized through one queue, so two installs cannot race the same state file.

## License

MIT.
