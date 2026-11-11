import test from 'node:test'
import assert from 'node:assert/strict'

import { localized, searchCatalog } from '../lib/catalog.js'

const catalog = {
  categories: [{ id: 'databases', title: { en: 'Databases', es: 'Bases de datos' } }],
  servers: [
    {
      id: 'postgres',
      name: 'postgres',
      title: 'PostgreSQL',
      description: { en: 'Query a Postgres database.', es: 'Consulta una base Postgres.' },
      categories: ['databases'],
      tags: ['sql'],
      transport: 'stdio',
      verified: { package: 'postgres-mcp' },
    },
    {
      id: 'github',
      name: 'github',
      title: 'GitHub',
      description: { en: 'Issues and pull requests.', es: 'Issues y pull requests.' },
      categories: ['development'],
      transport: 'streamable-http',
      verified: { package: 'github-mcp' },
    },
  ],
}

const loaded = { entries: catalog.servers, categories: catalog.categories }

test('search matches names, tags, packages and categories', () => {
  assert.deepEqual(searchCatalog(loaded, { q: 'sql' }).map(server => server.id), ['postgres'])
  assert.deepEqual(searchCatalog(loaded, { q: 'github-mcp' }).map(server => server.id), ['github'])
  assert.deepEqual(searchCatalog(loaded, { category: 'databases' }).map(server => server.id), ['postgres'])
  assert.equal(searchCatalog(loaded, { q: 'nothing-here' }).length, 0)
})

test('search results are localized without losing the raw fields', () => {
  const [server] = searchCatalog(loaded, { q: "postgres", locale: "es" })
  assert.equal(server.titleText, 'PostgreSQL')
  assert.equal(server.descriptionText, 'Consulta una base Postgres.')
  assert.equal(server.description.en, 'Query a Postgres database.')
})

test('missing translations fall back to English', () => {
  assert.equal(localized({ en: 'Hello' }, 'zh'), 'Hello')
  assert.equal(localized('plain', 'es'), 'plain')
  assert.equal(localized(undefined, 'es'), '')
})

test('the limit is applied after filtering', () => {
  assert.equal(searchCatalog(loaded, { q: 'e', limit: 1 }).length, 1)
})
