/**
 * The curated catalog is data, not code: `data/catalog.json` is also the source
 * the published market index is generated from, so the UI, the model tools and
 * the GitHub Pages listing always describe the same servers.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const CATALOG_URL = new URL('../data/catalog.json', import.meta.url)

/** @type {{entries: object[], categories: object[], updatedAt: string} | undefined} */
let cached

/**
 * Load and memoize the bundled catalog.
 * @returns {Promise<{entries: object[], categories: object[], updatedAt: string}>}
 */
export async function loadCatalog() {
  if (cached) return cached
  const text = await readFile(fileURLToPath(CATALOG_URL), 'utf8')
  const parsed = JSON.parse(text)
  cached = {
    entries: Array.isArray(parsed.servers) ? parsed.servers : [],
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    updatedAt: typeof parsed.updated === 'string' ? parsed.updated : '',
  }
  return cached
}

/**
 * Pick one language out of a localized text, falling back to English.
 * @param {Record<string,string>|string|undefined} text
 * @param {string} locale
 * @returns {string}
 */
export function localized(text, locale) {
  if (typeof text === 'string') return text
  if (!text || typeof text !== 'object') return ''
  const language = String(locale || 'en').toLowerCase().split('-')[0]
  return text[language] ?? text.en ?? Object.values(text)[0] ?? ''
}

/**
 * Filter the catalog for the UI or a model tool.
 * @param {{entries: object[]}} catalog
 * @param {{q?: string, category?: string, locale?: string, limit?: number}} [query]
 * @returns {object[]} matching entries with localized text flattened.
 */
export function searchCatalog(catalog, query = {}) {
  const q = String(query.q ?? '').trim().toLowerCase()
  const category = String(query.category ?? '').trim().toLowerCase()
  const locale = query.locale ?? 'en'
  const limit = Math.min(Math.max(Number(query.limit ?? 100) || 100, 1), 200)
  const terms = q === '' ? [] : q.split(/\s+/)
  const matches = []
  for (const entry of catalog.entries) {
    const categories = Array.isArray(entry.categories) ? entry.categories : []
    if (category !== '' && !categories.includes(category)) continue
    const haystack = [
      entry.name,
      entry.title,
      entry.description?.en,
      entry.description?.[locale],
      entry.verified?.package,
      ...categories,
      ...(entry.tags ?? []),
    ].filter(Boolean).join(' ').toLowerCase()
    if (terms.length > 0 && !terms.every(term => haystack.includes(term))) continue
    matches.push({
      ...entry,
      titleText: localized(entry.title, locale) || entry.name,
      descriptionText: localized(entry.description, locale),
      noteText: localized(entry.note, locale),
    })
  }
  return matches.slice(0, limit)
}

/**
 * @param {string} id catalog entry id.
 * @returns {Promise<object|undefined>}
 */
export async function findCatalogEntry(id) {
  const catalog = await loadCatalog()
  return catalog.entries.find(entry => entry.id === id)
}
