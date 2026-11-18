import { randomUUID } from 'node:crypto'
import {
  createSellerSpriteKeywordReverseRequest, isSellerSpriteKeywordReverseResponse,
  type SellerSpriteKeywordReverseInput, type SellerSpriteKeywordReverseRequest, type SellerSpriteKeywordReverseResponse,
} from '@cookie-amazon/protocol'

const CACHE_TTL_MS = 120_000
const MAX_CACHED_QUERIES = 8
type Enqueue = (job: { requestId: string; request: SellerSpriteKeywordReverseRequest }) => Promise<unknown>
type Entry = { promise: Promise<SellerSpriteKeywordReverseResponse>; expiresAt: number }

export const createKeywordQuery = (enqueue: Enqueue, targetId: string, now: () => number = Date.now) => {
  // ponytail: Cache only the keyword data shared by two tools; extend here if other tools prove to repeat queries.
  const queries = new Map<string, Entry>()
  const fetchKeywords = async (input: SellerSpriteKeywordReverseInput): Promise<SellerSpriteKeywordReverseResponse> => {
    const requestId = randomUUID()
    const response = await enqueue({ requestId, request: createSellerSpriteKeywordReverseRequest(requestId, targetId, input) })
    if (!isSellerSpriteKeywordReverseResponse(response) || response.requestId !== requestId) {
      throw new Error('INVALID_EXTENSION_RESPONSE')
    }
    return response
  }

  return async (input: SellerSpriteKeywordReverseInput, refresh = false) => {
    for (const [key, entry] of queries) if (entry.expiresAt <= now()) queries.delete(key)
    const key = JSON.stringify({ ...input, forceReStat: false })
    const cached = queries.get(key)
    if (cached && !refresh && !input.forceReStat) {
      const response = await cached.promise
      return { response, cache: { hit: true, expiresAt: response.ok ? new Date(cached.expiresAt).toISOString() : null } }
    }

    queries.delete(key)
    if (queries.size >= MAX_CACHED_QUERIES) queries.delete(queries.keys().next().value!)
    const entry: Entry = { promise: fetchKeywords(input), expiresAt: now() + CACHE_TTL_MS }
    queries.set(key, entry)
    try {
      const response = await entry.promise
      if (response.ok) entry.expiresAt = now() + CACHE_TTL_MS
      else if (queries.get(key) === entry) queries.delete(key)
      return { response, cache: { hit: false, expiresAt: response.ok ? new Date(entry.expiresAt).toISOString() : null } }
    } catch (error) {
      if (queries.get(key) === entry) queries.delete(key)
      throw error
    }
  }
}
