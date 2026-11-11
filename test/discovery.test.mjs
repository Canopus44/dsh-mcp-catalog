import test from 'node:test'
import assert from 'node:assert/strict'

import { convertEntry, parseJsonc, parseTomlMcp, stripJsonc } from '../lib/discovery.js'

test('jsonc comments and trailing commas are removed', () => {
  const text = `{
    // a comment
    "mcp": {
      "servers": { "pg": { "command": "npx", "args": ["mcp-postgres-server"], }, },
    },
  }`
  const parsed = parseJsonc(text)
  assert.equal(parsed.mcp.servers.pg.command, 'npx')
  assert.deepEqual(parsed.mcp.servers.pg.args, ['mcp-postgres-server'])
})

test('comment markers inside strings survive', () => {
  assert.equal(parseJsonc('{"url":"https://example.com/a//b"}').url, 'https://example.com/a//b')
  assert.match(stripJsonc('{"a":1}'), /\{"a":1\}/)
})

test('codex-style toml tables become server definitions', () => {
  const text = `
[mcp_servers.codebase-memory-mcp]
command = "/home/me/.local/bin/codebase-memory-mcp"
args = []
env = { CBM_CACHE_DIR = "/tmp/cbm" }

[mcp_servers.other]
command = "uvx"
args = ["mcp-proxy-for-aws@latest"]
`
  const servers = parseTomlMcp(text)
  assert.equal(servers['codebase-memory-mcp'].command, '/home/me/.local/bin/codebase-memory-mcp')
  assert.deepEqual(servers['codebase-memory-mcp'].args, [])
  assert.equal(servers['codebase-memory-mcp'].env.CBM_CACHE_DIR, '/tmp/cbm')
  assert.deepEqual(servers.other.args, ['mcp-proxy-for-aws@latest'])
})

test('opencode array commands become stdio definitions', () => {
  const server = convertEntry('github', { command: ['/home/me/bin/github-mcp', '--read-only'] })
  assert.equal(server.transport, 'stdio')
  assert.equal(server.command, '/home/me/bin/github-mcp')
  assert.deepEqual(server.args, ['--read-only'])
})

test('claude string commands keep their args', () => {
  const server = convertEntry('files', { command: 'npx', args: ['-y', 'server-filesystem', '/tmp'] })
  assert.equal(server.command, 'npx')
  assert.deepEqual(server.args, ['-y', 'server-filesystem', '/tmp'])
})

test('remote entries become streamable http and keep headers', () => {
  const server = convertEntry('github', {
    type: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    headers: { Authorization: 'Bearer x' },
  })
  assert.equal(server.transport, 'streamable-http')
  assert.equal(server.headers.Authorization, 'Bearer x')
})

test('env_vars are resolved from the current environment', () => {
  process.env.MCP_TEST_TOKEN = 'from-env'
  const server = convertEntry('srv', { command: 'npx', env_vars: ['MCP_TEST_TOKEN', 'MCP_TEST_MISSING'] })
  assert.equal(server.env.MCP_TEST_TOKEN, 'from-env')
  assert.equal(server.env.MCP_TEST_MISSING, undefined)
  delete process.env.MCP_TEST_TOKEN
})

test('entries without a command or url are skipped', () => {
  assert.equal(convertEntry('empty', {}), null)
})
