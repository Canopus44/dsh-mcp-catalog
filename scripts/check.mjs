/**
 * Release check. Runs before packaging and before the market index is rebuilt,
 * because a manifest that points at a missing file installs cleanly and then
 * fails at runtime, which is the worst moment to find out.
 */

import { readFile, stat, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const notes = []

function fail(message) {
  failures.push(message)
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function readJson(path) {
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw)
}

const packageJson = await readJson(join(root, 'package.json'))

/* ------------------------------------------------------------- manifest */

if (typeof packageJson.name !== 'string' || packageJson.name === '') fail('package.json: name is missing')
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(packageJson.version ?? '')) fail('package.json: version is not semver')

const manifest = packageJson.dsh ?? {}
if (manifest.manifestVersion !== 1) fail('package.json: dsh.manifestVersion must be 1')
if (manifest.bundle?.patch !== './cordis.patch.yml') fail('package.json: dsh.bundle.patch must be ./cordis.patch.yml')
if (!Array.isArray(manifest.client?.inject) || manifest.client.inject.length === 0) fail('package.json: dsh.client.inject is empty')
if (manifest.client?.platform !== 'web') fail('package.json: dsh.client.platform must be web')
if (typeof manifest.engines?.dsh !== 'string') fail('package.json: dsh.engines.dsh is missing')

/* -------------------------------------------------------------- exports */

for (const [key, target] of Object.entries(packageJson.exports ?? {})) {
  if (target.includes('*')) {
    const directory = join(root, dirname(target))
    if (!existsSync(directory)) fail(`exports["${key}"]: directory ${dirname(target)} does not exist`)
    continue
  }
  if (!(await exists(join(root, target)))) fail(`exports["${key}"]: ${target} does not exist`)
}

for (const entry of packageJson.files ?? []) {
  if (!(await exists(join(root, entry)))) fail(`files[]: ${entry} does not exist`)
}

/* ---------------------------------------------------------------- patch */

const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
if (!patch.includes(`name: ${packageJson.name}`)) fail(`cordis.patch.yml: no row named ${packageJson.name}`)
if (!/^\s*-?\s*id: [A-Za-z0-9_-]+$/m.test(patch)) fail('cordis.patch.yml: row id is missing or malformed')

/* ---------------------------------------------------------------- locale */

const localeFiles = (await readdir(join(root, 'locale'))).filter(name => name.endsWith('.json'))
for (const required of ['en.json', 'es.json', 'zh.json']) {
  if (!localeFiles.includes(required)) fail(`locale: ${required} is missing`)
}
for (const file of localeFiles) {
  const data = await readJson(join(root, 'locale', file))
  if (typeof data.meta?.title !== 'string' || data.meta.title === '') fail(`locale/${file}: meta.title is missing`)
  if (typeof data.meta?.description !== 'string' || data.meta.description === '') fail(`locale/${file}: meta.description is missing`)
  if (data.meta?.detail && !(await exists(join(root, data.meta.detail)))) fail(`locale/${file}: meta.detail ${data.meta.detail} does not exist`)
}

/* ----------------------------------------------------------------- icon */

const iconPath = join(root, 'assets/icon.svg')
if (!(await exists(iconPath))) {
  fail('assets/icon.svg is missing')
} else {
  const icon = await readFile(iconPath, 'utf8')
  if (!icon.trimStart().startsWith('<svg')) fail('assets/icon.svg is not an SVG document')
  if (Buffer.byteLength(icon) > 256 * 1024) fail('assets/icon.svg is larger than 256 KiB')
}

/* -------------------------------------------------------------- catalog */

const catalog = await readJson(join(root, 'data/catalog.json'))
if (catalog.format !== 1) fail('data/catalog.json: format must be 1')
if (!Array.isArray(catalog.categories) || catalog.categories.length === 0) fail('data/catalog.json: categories is empty')
if (!Array.isArray(catalog.servers) || catalog.servers.length === 0) fail('data/catalog.json: servers is empty')

const categoryIds = new Set((catalog.categories ?? []).map(category => category.id))
const ids = new Set()
const names = new Set()
for (const server of catalog.servers ?? []) {
  const where = `data/catalog.json ${server.id ?? server.name ?? '(unnamed)'}`
  for (const field of ['id', 'name', 'title', 'description', 'transport', 'homepage']) {
    if (server[field] === undefined || server[field] === null || server[field] === '') fail(`${where}: ${field} is missing`)
  }
  if (ids.has(server.id)) fail(`${where}: duplicate id`)
  ids.add(server.id)
  if (names.has(server.name)) fail(`${where}: duplicate name`)
  names.add(server.name)
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(server.name ?? '')) fail(`${where}: name must match [A-Za-z0-9_-]{1,32}`)
  for (const locale of ['en', 'es', 'zh']) {
    if (typeof server.description?.[locale] !== 'string' || server.description[locale] === '') fail(`${where}: description.${locale} is missing`)
  }
  for (const category of server.categories ?? []) {
    if (!categoryIds.has(category)) fail(`${where}: unknown category ${category}`)
  }
  if (!['stdio', 'streamable-http'].includes(server.transport)) fail(`${where}: unknown transport ${server.transport}`)
  if (server.transport === 'stdio' && typeof server.command !== 'string') fail(`${where}: stdio entry needs command`)
  if (server.transport === 'streamable-http' && !/^https:\/\//.test(server.url ?? '')) fail(`${where}: http entry needs an https url`)
  if (server.verified?.package && !server.homepage.startsWith('https://')) fail(`${where}: homepage must be https`)
  for (const item of server.env ?? []) {
    if (typeof item.name !== 'string' || item.name === '') fail(`${where}: env entry without name`)
  }
  const text = JSON.stringify(server)
  for (const match of text.matchAll(/\{\{([^}]*)\}\}/g)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(match[1])) fail(`${where}: placeholder {{${match[1]}}} is not upper snake case`)
  }
}
notes.push(`catalog: ${catalog.servers.length} servers, ${catalog.categories.length} categories`)

/* -------------------------------------------------------------- sources */

for (const file of ['index.js', 'lib', 'client']) {
  if (!(await exists(join(root, file)))) fail(`${file} is missing`)
}

const clientPath = join(root, 'client/client.js')
if (await exists(clientPath)) {
  const client = await readFile(clientPath, 'utf8')
  if (!client.includes(`id: '${packageJson.name}'`)) fail(`client/client.js: __ModuleLoader__ id must be ${packageJson.name}`)
  const check = spawnSync(process.execPath, ['--check', clientPath], { encoding: 'utf8' })
  if (check.status !== 0) fail(`client/client.js does not parse: ${check.stderr.split('\n')[0]}`)
}

for (const file of ['index.js', ...(await readdir(join(root, 'lib'))).filter(name => name.endsWith('.js')).map(name => `lib/${name}`)]) {
  const check = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' })
  if (check.status !== 0) fail(`${file} does not parse: ${check.stderr.split('\n')[0]}`)
}

/* ---------------------------------------------------------------- index */

const marketPath = join(root, 'docs/market/index.json')
if (await exists(marketPath)) {
  const index = await readJson(marketPath)
  if (index.format !== 1) fail('docs/market/index.json: format must be 1')
  const plugins = index.plugins ?? []
  if (plugins.length === 0) fail('docs/market/index.json: no plugins')
  for (const plugin of plugins) {
    if (!plugin.versions?.length) fail(`docs/market/index.json ${plugin.name}: no versions`)
    for (const version of plugin.versions ?? []) {
      if (!version.source || !version.engines?.dsh) fail(`docs/market/index.json ${plugin.name}: version without source or engines.dsh`)
    }
    if (plugin.icon && plugin.icon.startsWith('data:') && Buffer.byteLength(plugin.icon) > 32768) {
      fail(`docs/market/index.json ${plugin.name}: inline icon is larger than 32 KiB`)
    }
  }
  notes.push(`market index: ${plugins.length} plugins`)
}

/* --------------------------------------------------------------- report */

if (failures.length > 0) {
  console.error(`check: ${failures.length} problem(s)`)
  for (const message of failures) console.error(`  - ${message}`)
  process.exit(1)
}

for (const note of notes) console.log(note)
console.log(`check: ok (${packageJson.name}@${packageJson.version})`)
