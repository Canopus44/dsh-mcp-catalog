/**
 * Builds the plugin market index served from GitHub Pages.
 *
 * The index points at a git commit instead of npm, because this package is not
 * published to a registry. Run it after committing, so the recorded commit is
 * the one that contains the code being announced.
 */

import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const catalog = JSON.parse(await readFile(join(root, 'data/catalog.json'), 'utf8'))

const commit = process.env.MARKET_COMMIT ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const published = Number(process.env.MARKET_TIMESTAMP ?? execFileSync('git', ['log', '-1', '--format=%ct'], { cwd: root, encoding: 'utf8' }).trim())
const repository = 'https://github.com/Canopus44/dsh-mcp-catalog'

if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`not a full commit: ${commit}`)

const out = join(root, 'docs/market')
await mkdir(join(out, 'icons'), { recursive: true })
await cp(join(root, 'assets/icon.svg'), join(out, 'icons/dsh-mcp-catalog.svg'))

const index = {
  format: 1,
  title: {
    en: 'Canopus MCP tools',
    es: 'Herramientas MCP de Canopus',
    zh: 'Canopus MCP 工具',
  },
  description: {
    en: 'MCP servers for DeepSeek Harness: install, import, and mount them in the current session.',
    es: 'Servidores MCP para DeepSeek Harness: instálalos, impórtalos y móntalos en la sesión actual.',
    zh: '面向 DeepSeek Harness 的 MCP 服务器：安装、导入并在当前会话中挂载。',
  },
  metadata: {
    categories: [
      { id: 'tools', title: { en: 'Tools', es: 'Herramientas', zh: '工具' } },
    ],
  },
  plugins: [
    {
      name: packageJson.name,
      title: {
        en: 'MCP Catalog',
        es: 'Catálogo MCP',
        zh: 'MCP 目录',
      },
      description: {
        en: `Discover MCP servers already configured on this machine, import them, and install from a catalog of ${catalog.servers.length} verified entries.`,
        es: `Descubre los servidores MCP ya configurados en esta máquina, impórtalos e instala desde un catálogo de ${catalog.servers.length} entradas verificadas.`,
        zh: `发现本机已配置的 MCP 服务器，导入它们，并从 ${catalog.servers.length} 个已验证条目中安装。`,
      },
      icon: 'icons/dsh-mcp-catalog.svg',
      author: packageJson.author,
      homepage: repository,
      repository: { url: repository, directory: '.' },
      metadata: {
        category: 'tools',
        labels: ['mcp', 'marketplace', 'integration'],
        sortKeys: ['name'],
      },
      versions: [
        {
          version: packageJson.version,
          publishTimestamp: published,
          source: {
            type: 'git',
            url: `${repository}.git`,
            commit,
            path: '.',
          },
          engines: { dsh: packageJson.dsh.engines.dsh },
        },
      ],
    },
  ],
}

await writeFile(join(out, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
await writeFile(join(out, '.nojekyll'), '')
console.log(`market: ${packageJson.name}@${packageJson.version} at ${commit.slice(0, 12)}`)
console.log(`market: ${join(out, 'index.json')}`)
