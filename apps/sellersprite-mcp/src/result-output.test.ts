import { describe, expect, it } from 'vitest'
import { createResultOutput, MAX_OUTPUT_CHARS } from './result-output.js'

const parse = (output: ReturnType<ReturnType<typeof createResultOutput>['format']>) => {
  expect(output.content[0].text.length).toBeLessThanOrEqual(MAX_OUTPUT_CHARS)
  return JSON.parse(output.content[0].text)
}

describe('bounded MCP results', () => {
  it('preserves the existing shape and error flag of small results', () => {
    const output = createResultOutput()
    const value = { ok: false, error: { code: 'TARGET_NOT_LOGGED_IN' } }
    const result = output.format(value, true)
    expect(result).toEqual({ content: [{ type: 'text', text: JSON.stringify(value) }], isError: true })
  })

  it('keeps upstream totals separate from cached array lengths and supports explicit field selection', () => {
    const output = createResultOutput()
    const original = { ok: true, data: { total: 1000, items: [{ keywords: 'tent', searches: 100, trend: 'x'.repeat(20_000) }] } }
    const metadata = parse(output.format(original))
    expect(metadata.summary.data).toEqual({ total: 1000, items: { type: 'array', length: 1 } })
    const selected = parse(output.read({ resultId: metadata.resultId, path: ['data', 'items'], fields: ['keywords', 'searches'] }))
    expect(selected).toMatchObject({ total: 1, items: [{ keywords: 'tent', searches: 100 }], hasMore: false, nextOffset: null })
    const oversized = output.read({ resultId: metadata.resultId, path: ['data', 'items'] })
    expect(oversized.isError).toBe(true)
    expect(parse(oversized)).toMatchObject({ error: 'RESULT_PATH_TOO_LARGE', path: ['data', 'items', '0'], availableFields: ['keywords', 'searches', 'trend'] })
    expect(parse(output.read({ resultId: metadata.resultId, path: ['data'], fields: ['total'] })).value).toEqual({ total: 1000 })
  })

  it('retrieves oversized strings losslessly even when JSON escaping expands their size', () => {
    const output = createResultOutput()
    const original = (String.fromCharCode(0, 34, 92, 10) + '帐篷😀').repeat(5000)
    const { resultId } = parse(output.format({ text: original }))
    let offset = 0
    let recovered = ''
    do {
      const chunk = parse(output.read({ resultId, path: ['text'], offset, limit: 20_000 }))
      recovered += chunk.text
      expect(chunk.total).toBe(original.length)
      if (!chunk.hasMore) break
      expect(chunk.nextOffset).toBeGreaterThan(offset)
      offset = chunk.nextOffset
    } while (recovered.length <= original.length)
    expect(recovered).toBe(original)
  })

  it('expires results after fifteen minutes and evicts the oldest of more than eight results', () => {
    let now = 0
    const output = createResultOutput(() => now)
    const cache = () => parse(output.format({ value: 'x'.repeat(20_000) })).resultId as string
    const oldest = cache()
    const retained = cache()
    for (let index = 0; index < 7; index++) cache()
    expect(parse(output.read({ resultId: oldest })).error).toBe('RESULT_NOT_FOUND')
    expect(parse(output.read({ resultId: retained, path: ['value'], limit: 1 })).text).toBe('x')
    now = 15 * 60_000
    const expired = output.read({ resultId: retained })
    expect(expired.isError).toBe(true)
    expect(parse(expired).error).toBe('RESULT_NOT_FOUND')
  })

  it('rejects inherited paths and handles empty arrays and exhausted pages', () => {
    const output = createResultOutput()
    const { resultId } = parse(output.format({ empty: [], rows: [1, 2], text: 'x'.repeat(20_000) }))
    for (const path of [['__proto__'], ['constructor'], ['rows', 'length'], ['rows', '-1'], ['rows', '01']]) {
      expect(parse(output.read({ resultId, path })).error).toBe('RESULT_PATH_NOT_FOUND')
    }
    expect(parse(output.read({ resultId, path: ['empty'] }))).toMatchObject({ total: 0, items: [], hasMore: false, nextOffset: null })
    expect(parse(output.read({ resultId, path: ['rows'], offset: 2 }))).toMatchObject({ items: [], hasMore: false, nextOffset: null })
    expect(parse(output.read({ resultId, path: ['rows'], offset: 3 })).error).toBe('RESULT_OFFSET_OUT_OF_RANGE')
    expect(parse(output.read({ resultId, path: ['rows'], fields: ['missing'] })).error).toBe('RESULT_FIELDS_REQUIRE_OBJECTS')
  })

  it('bounds metadata and retains the error flag even for unusually wide objects', () => {
    const output = createResultOutput()
    const wide = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
      'field-' + index + 'x'.repeat(128),
      Object.fromEntries(Array.from({ length: 10 }, (_, child) => ['child-' + child + 'y'.repeat(128), 'z'.repeat(128)])),
    ]))
    const result = output.format(wide, true)
    expect(result.isError).toBe(true)
    const metadata = parse(result)
    expect(metadata.resultId).toEqual(expect.any(String))
    expect(metadata.readTool).toBe('sellersprite_read_result')
  })
})
