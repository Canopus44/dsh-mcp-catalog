/**
 * Import a server from a page a human pasted: a GitHub repository, a docs
 * page, any URL that shows how to run an MCP server.
 *
 * Two rules shape this module. First, a URL from the UI is untrusted input:
 * it may point at loopback, a private network or a cloud metadata endpoint, so
 * every hop is resolved and checked before the request goes out. Second, the
 * result is a *suggestion*: the caller reviews the command and env before
 * anything is saved or spawned.
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 12000

/**
 * @param {string} address an IPv4 or IPv6 literal.
 * @returns {boolean} true when the address is not public.
 */
export function isPrivateAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  const normalized = address.toLowerCase()
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fe80') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7))
  return false
}

/**
 * Reject URLs that are not plain public HTTPS.
 * @param {string} raw
 * @returns {Promise<URL>} the parsed URL when it is safe to fetch.
 */
export async function assertPublicUrl(raw) {
  let url
  try {
    url = new URL(String(raw))
  } catch {
    throw new Error('not a valid URL')
  }
  if (url.protocol !== 'https:') throw new Error('only https URLs can be inspected')
  if (url.username !== '' || url.password !== '') throw new Error('URLs with credentials are not accepted')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new Error('local addresses are not accepted')
  }
  if (isIP(host) !== 0) {
    if (isPrivateAddress(host)) throw new Error('private addresses are not accepted')
    return url
  }
  const addresses = await lookup(host, { all: true, verbatim: true })
  if (addresses.length === 0) throw new Error('host does not resolve')
  if (addresses.some(entry => isPrivateAddress(entry.address))) throw new Error('host resolves to a private address')
  return url
}

/**
 * Read at most {@link MAX_BYTES} from a response body.
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function readLimited(response) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) {
      await reader.cancel()
      break
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(size > MAX_BYTES ? MAX_BYTES : size)
  let offset = 0
  for (const chunk of chunks) {
    if (offset + chunk.byteLength > MAX_BYTES) {
      merged.set(chunk.subarray(0, MAX_BYTES - offset), offset)
      break
    }
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged)
}

/**
 * Fetch a public URL, following up to three redirects that are each validated.
 * @param {string} raw
 * @returns {Promise<{url:string, text:string, contentType:string, status:number}>}
 */
export async function fetchPublicText(raw) {
  let current = await assertPublicUrl(raw)
  for (let hop = 0; hop < 4; hop += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'text/html, text/plain, application/json, text/markdown;q=0.9, */*;q=0.5', 'user-agent': 'dsh-mcp-catalog/0.1 (+https://github.com/Canopus44/dsh-mcp-catalog)' },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error(`redirect without a location (${response.status})`)
      current = await assertPublicUrl(new URL(location, current).toString())
      continue
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${current.host}`)
    return { url: current.toString(), text: await readLimited(response), contentType, status: response.status }
  }
  throw new Error('too many redirects')
}

/**
 * Turn a package name into a usable server name.
 * @param {string} packageName
 * @returns {string}
 */
export function serverNameFromPackage(packageName) {
  const bare = String(packageName).replace(/^@[^/]+\//, '')
  const trimmed = bare
    .replace(/^mcp-server-/, '')
    .replace(/^server-/, '')
    .replace(/-mcp-server$/, '')
    .replace(/-mcp$/, '')
    .replace(/^mcp-/, '')
  return trimmed.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'mcp-server'
}

/**
 * @param {string} text
 * @returns {string} HTML reduced to readable text, entities decoded.
 */
export function htmlToText(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
}

/**
 * Parse one line of `npx`/`uvx`/`bunx` invocation into a candidate.
 * @param {string} runtime
 * @param {string} rest
 * @returns {object|null}
 */
function commandCandidate(runtime, rest) {
  const cleaned = rest.replace(/[`"'\\]/g, ' ').trim()
  const tokens = []
  const re = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g
  let match
  while ((match = re.exec(cleaned))) tokens.push(match[0].replace(/^["']|["']$/g, ''))
  if (tokens.length === 0) return null
  const args = []
  let packageToken = ''
  const flagsWithValue = new Set(['--package', '-p', '--from', '--with', '--python'])
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '-y' || token === '--yes' || token === '--allow-build' || token === '--prefer-offline') continue
    if (token.startsWith('-')) {
      if (flagsWithValue.has(token)) index += 1
      continue
    }
    if (packageToken === '') {
      // `npx @scope/pkg@1.2 arg` keeps the version; `uvx tool==1.0` too.
      packageToken = token
      continue
    }
    args.push(token)
  }
  if (packageToken === '') return null
  const name = serverNameFromPackage(packageToken.replace(/@[\d.]+$/, ''))
  const command = runtime === 'uvx' ? 'uvx' : runtime === 'bunx' ? 'bunx' : 'npx'
  return {
    name,
    title: packageToken,
    transport: 'stdio',
    command,
    args: [...(command === 'npx' || command === 'bunx' ? ['-y', packageToken] : [packageToken]), ...args],
    env: {},
    evidence: `${runtime} ${packageToken}`,
  }
}

/**
 * Pull candidates out of README / docs prose.
 * @param {string} text plain text or HTML
 * @returns {{server:object, confidence:string, evidence:string}[]}
 */
export function candidatesFromText(text) {
  const plain = htmlToText(text)
  const found = []
  const seen = new Set()
  const push = (server, confidence, evidence) => {
    if (!server) return
    const key = `${server.transport}:${server.command ?? server.url}:${(server.args ?? []).join(' ')}`
    if (seen.has(key)) return
    seen.add(key)
    found.push({ server, confidence, evidence: evidence.slice(0, 300) })
  }

  const blocks = [...plain.matchAll(/```(?:json|jsonc)?\s*\n([\s\S]*?)```/g)].map(match => match[1])
  for (const block of blocks) {
    if (!/"mcpServers"|"servers"\s*:/.test(block)) continue
    try {
      const data = JSON.parse(stripTrailingCommas(block))
      const table = data.mcpServers ?? data.servers ?? {}
      for (const [name, entry] of Object.entries(table)) {
        if (!entry || typeof entry !== 'object') continue
        const command = Array.isArray(entry.command) ? entry.command : [entry.command, ...(Array.isArray(entry.args) ? entry.args : [])]
        if (entry.url) {
          push({ name, transport: 'streamable-http', url: String(entry.url), headers: entry.headers ?? {} }, 'config', `mcpServers.${name}`)
        } else if (command[0]) {
          push({ name, transport: 'stdio', command: String(command[0]), args: command.slice(1).map(String), env: entry.env ?? {} }, 'config', `mcpServers.${name}`)
        }
      }
    } catch {
      // A malformed example block is not a reason to fail the whole page.
    }
  }

  for (const match of plain.matchAll(/\b(npx|pnpx|bunx|uvx)\b([^\n`]*)/g)) {
    const candidate = commandCandidate(match[1], match[2])
    if (candidate) push(candidate, 'readme', candidate.evidence)
  }
  return found.slice(0, 20)
}

/** @param {string} text */
function stripTrailingCommas(text) {
  return text.replace(/,\s*([}\]])/g, '$1')
}

/**
 * Recognize a GitHub repository URL.
 * @param {string} raw
 * @returns {{owner:string, repo:string}|null}
 */
export function githubRepo(raw) {
  try {
    const url = new URL(raw)
    if (url.hostname !== 'github.com' && url.hostname !== 'raw.githubusercontent.com') return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') }
  } catch {
    return null
  }
}

/**
 * Fetch a GitHub README without the API's rate limit: raw content first.
 * @param {{owner:string,repo:string}} repo
 * @returns {Promise<{text:string, url:string} | null>}
 */
export async function fetchGithubReadme(repo) {
  const names = ['README.md', 'readme.md', 'README.MD', 'README.markdown']
  const branches = ['main', 'master']
  for (const branch of branches) {
    for (const name of names) {
      const raw = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${branch}/${name}`
      try {
        const result = await fetchPublicText(raw)
        if (result.status === 200 && result.text.trim() !== '') return { text: result.text, url: raw }
      } catch {
        // Try the next spelling/branch.
      }
    }
  }
  return null
}

/**
 * Inspect a pasted URL and return suggested servers.
 * @param {string} raw
 * @returns {Promise<{url:string, kind:string, repo?:object, candidates:object[], notes:string[]}>}
 */
export async function inspectUrl(raw) {
  const notes = []
  const repo = githubRepo(raw)
  const page = await fetchPublicText(raw)
  let text = page.text
  let kind = 'page'
  if (repo) {
    kind = 'github'
    const readme = await fetchGithubReadme(repo)
    if (readme) {
      text = `${readme.text}\n${page.text}`
      notes.push(`read ${readme.url}`)
    } else {
      notes.push('README not found; used the page HTML')
    }
  }
  const candidates = candidatesFromText(text)
  if (candidates.length === 0) notes.push('no install command found; add the server form manually')
  return { url: page.url, kind, repo: repo ?? undefined, candidates, notes }
}
