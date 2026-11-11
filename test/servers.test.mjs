import test from 'node:test'
import assert from 'node:assert/strict'

import { REDACTED, expandServer, mcpClientConfig, normalizeServer, placeholdersOf, publicServer } from '../lib/servers.js'

test('stdio definitions keep args and env', () => {
  const result = normalizeServer({
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    env: { LOG_LEVEL: 'info' },
  })
  assert.equal(result.ok, true)
  assert.equal(result.server.transport, 'stdio')
  assert.deepEqual(result.server.args, ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'])
  assert.deepEqual(result.server.env, { LOG_LEVEL: 'info' })
  assert.equal(result.server.enabled, true)
})

test('a stdio definition without a command is rejected', () => {
  const result = normalizeServer({ name: 'broken' })
  assert.equal(result.ok, false)
  assert.match(result.errors.join(' '), /need a command/)
})

test('names outside the tool-name alphabet are rejected', () => {
  const result = normalizeServer({ name: 'not a name', command: 'npx' })
  assert.equal(result.ok, false)
  assert.match(result.errors.join(' '), /\[A-Za-z0-9_-\]/)
})

test('http definitions keep headers but reject credentials in the URL', () => {
  const ok = normalizeServer({
    name: 'remote',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    headers: { Authorization: 'Bearer abc' },
  })
  assert.equal(ok.ok, true)
  assert.equal(ok.server.transport, 'streamable-http')
  assert.equal(ok.server.headers.Authorization, 'Bearer abc')

  const bad = normalizeServer({ name: 'remote', transport: 'streamable-http', url: 'https://user:pass@example.com/mcp' })
  assert.equal(bad.ok, false)
  assert.match(bad.errors.join(' '), /credentials/)
})

test('unresolved placeholders block the definition', () => {
  const result = normalizeServer({ name: 'neon', transport: 'streamable-http', url: 'https://mcp.neon.tech/sse?key={{NEON_API_KEY}}' })
  assert.equal(result.ok, false)
  assert.match(result.errors.join(' '), /NEON_API_KEY/)
})

test('placeholders resolve from the env map', () => {
  const result = normalizeServer({
    name: 'neon',
    transport: 'streamable-http',
    url: 'https://mcp.neon.tech/sse',
    headers: { Authorization: 'Bearer {{NEON_API_KEY}}' },
    env: { NEON_API_KEY: 'secret-value' },
  })
  assert.equal(result.ok, true)
  const expanded = expandServer(result.server)
  assert.equal(expanded.headers.Authorization, 'Bearer secret-value')
  assert.deepEqual(placeholdersOf(result.server), [])
})

test('a missing placeholder value stays literal and fails', () => {
  const result = normalizeServer({
    name: 'remote',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    headers: { Authorization: 'Bearer {{MISSING_KEY}}' },
  })
  assert.equal(result.ok, false)
  assert.match(result.errors.join(' '), /MISSING_KEY/)
})

test('secret-looking env values are redacted in public output', () => {
  const result = normalizeServer({ name: 'srv', command: 'npx', env: { GITHUB_TOKEN: 'ghp_x', FOLDER: '/tmp' } })
  assert.equal(result.ok, true)
  const published = publicServer(result.server)
  assert.equal(published.env.GITHUB_TOKEN, REDACTED)
  assert.equal(published.env.FOLDER, '/tmp')
})

test('posting a redacted value back keeps the stored secret', () => {
  const first = normalizeServer({ name: 'srv', command: 'npx', env: { GITHUB_TOKEN: 'ghp_x' } })
  const second = normalizeServer(
    { name: 'srv', command: 'npx', env: { GITHUB_TOKEN: REDACTED } },
    { previous: first.server },
  )
  assert.equal(second.ok, true)
  assert.equal(second.server.env.GITHUB_TOKEN, 'ghp_x')
})

test('the mcp-client config carries the validated fields', () => {
  const result = normalizeServer({
    name: 'docs',
    command: 'npx',
    args: ['-y', 'some-mcp'],
    cwd: '/tmp',
    env: { KEY: 'value' },
    toolCallTimeoutMs: 45000,
  })
  const config = mcpClientConfig(result.server)
  assert.equal(config.serverName, 'docs')
  assert.equal(config.transport, 'stdio')
  assert.equal(config.command, 'npx')
  assert.equal(config.cwd, '/tmp')
  assert.equal(config.toolCallTimeoutMs, 45000)
  assert.equal(config.failOnStartupError, false)
})
