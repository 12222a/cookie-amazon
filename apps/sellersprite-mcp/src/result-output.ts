import { randomUUID } from 'node:crypto'

export const MAX_OUTPUT_CHARS = 16_000
const CACHE_TTL_MS = 15 * 60_000
const MAX_CACHED_RESULTS = 8

type ReadResultInput = {
  resultId: string
  path?: string[]
  offset?: number
  limit?: number
  fields?: string[]
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const encode = (value: unknown, isError = false) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  ...(isError ? { isError: true } : {}),
})
const fits = (output: ReturnType<typeof encode>): boolean => output.content[0].text.length <= MAX_OUTPUT_CHARS

const summarize = (value: unknown, depth = 0): unknown => {
  if (Array.isArray(value)) return { type: 'array', length: value.length }
  if (typeof value === 'string' && value.length > 128) return { type: 'string', length: value.length }
  if (!record(value)) return value
  if (depth >= 2) return { type: 'object' }
  return Object.fromEntries(Object.entries(value).slice(0, 10)
    .map(([key, item]) => [key.slice(0, 128), summarize(item, depth + 1)]))
}

export const createResultOutput = (now: () => number = Date.now) => {
  const cache = new Map<string, { value: unknown; expiresAt: number }>()
  const prune = (): void => {
    for (const [id, entry] of cache) if (entry.expiresAt <= now()) cache.delete(id)
  }
  const format = (value: unknown, isError = false) => {
    const output = encode(value, isError)
    if (fits(output)) return output
    prune()
    if (cache.size >= MAX_CACHED_RESULTS) cache.delete(cache.keys().next().value!)
    const resultId = randomUUID()
    const expiresAt = now() + CACHE_TTL_MS
    cache.set(resultId, { value, expiresAt })
    const metadata = {
      resultId, expiresAt: new Date(expiresAt).toISOString(), totalChars: output.content[0].text.length,
      readTool: 'sellersprite_read_result', summary: summarize(value),
      message: 'Full response cached in this MCP process. Read by path and follow nextOffset until hasMore is false. Array lengths describe cached rows, not all upstream matches.',
    }
    const bounded = encode(metadata, isError)
    return fits(bounded) ? bounded : encode({ ...metadata, summary: { type: typeof value } }, isError)
  }

  const read = ({ resultId, path = [], offset = 0, limit, fields }: ReadResultInput) => {
    prune()
    const entry = cache.get(resultId)
    if (!entry) return encode({ error: 'RESULT_NOT_FOUND', message: 'Result expired, was evicted, or belongs to a previous MCP process. Run the original tool again.' }, true)
    let value: unknown = entry.value
    for (const key of path) {
      if (Array.isArray(value) && /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length) value = value[Number(key)]
      else if (record(value) && Object.hasOwn(value, key)) value = value[key]
      else return encode({ error: 'RESULT_PATH_NOT_FOUND', path }, true)
    }
    const tooLarge = (item: unknown, itemPath: string[]) => {
      const details = {
        error: 'RESULT_PATH_TOO_LARGE', resultId, path: itemPath,
        availableFields: record(item) ? Object.keys(item).filter((key) => key.length <= 128).slice(0, 20) : [],
        message: 'Select fewer fields or read a deeper path. Arrays and strings can be paged without dropping data.',
      }
      const output = encode(details, true)
      return fits(output) ? output : encode({ ...details, availableFields: [] }, true)
    }
    const project = (item: unknown): unknown => fields && record(item)
      ? Object.fromEntries(fields.filter((key) => Object.hasOwn(item, key)).map((key) => [key, item[key]]))
      : item

    if (Array.isArray(value)) {
      if (offset > value.length) return encode({ error: 'RESULT_OFFSET_OUT_OF_RANGE', total: value.length }, true)
      const items: unknown[] = []
      const page = () => {
        const nextOffset = offset + items.length
        const hasMore = nextOffset < value.length
        return encode({ resultId, path, offset, total: value.length, items, hasMore, nextOffset: hasMore ? nextOffset : null })
      }
      let output = page()
      for (let index = offset; index < Math.min(value.length, offset + Math.min(limit ?? 20, 100)); index++) {
        if (fields && !record(value[index])) return encode({ error: 'RESULT_FIELDS_REQUIRE_OBJECTS' }, true)
        items.push(project(value[index]))
        const candidate = page()
        if (!fits(candidate)) {
          items.pop()
          return items.length === 0 ? tooLarge(value[index], [...path, String(index)]) : output
        }
        output = candidate
      }
      return output
    }
    if (typeof value === 'string') {
      if (offset > value.length) return encode({ error: 'RESULT_OFFSET_OUT_OF_RANGE', total: value.length }, true)
      let length = Math.min(limit ?? 12_000, value.length - offset)
      while (true) {
        const nextOffset = offset + length
        const hasMore = nextOffset < value.length
        const output = encode({ resultId, path, offset, total: value.length, text: value.slice(offset, nextOffset), hasMore, nextOffset: hasMore ? nextOffset : null })
        if (fits(output)) return output
        length = Math.floor(length / 2)
      }
    }
    if (fields && !record(value)) return encode({ error: 'RESULT_FIELDS_REQUIRE_OBJECTS' }, true)
    const output = encode({ resultId, path, value: project(value) })
    return fits(output) ? output : tooLarge(value, path)
  }

  return { format, read }
}
