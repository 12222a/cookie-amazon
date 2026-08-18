import { describe, expect, it } from 'vitest'
import type { ProductTrend } from '@cookie-amazon/analytics'
import {
  applyView,
  ariaSort,
  DEFAULT_FILTER,
  DEFAULT_SORT,
  toCriteria,
  toggleSelection,
  toggleSort,
} from './workbench-state'

const trend = (overrides: Partial<ProductTrend> = {}): ProductTrend => ({
  asin: 'A1',
  title: 'title-A1',
  metric: 'price',
  first: 10,
  last: 12,
  absoluteChange: 2,
  relativeChange: 0.2,
  direction: 'up',
  sampleCount: 2,
  ...overrides,
})

describe('toggleSort', () => {
  it('flips direction when the same key is toggled', () => {
    expect(toggleSort({ key: 'last', direction: 'asc' }, 'last')).toEqual({
      key: 'last',
      direction: 'desc',
    })
    expect(toggleSort({ key: 'last', direction: 'desc' }, 'last')).toEqual({
      key: 'last',
      direction: 'asc',
    })
  })

  it('switches to a new key defaulting to ascending', () => {
    expect(toggleSort({ key: 'last', direction: 'desc' }, 'asin')).toEqual({
      key: 'asin',
      direction: 'asc',
    })
  })
})

describe('toggleSelection', () => {
  it('adds an unselected asin and removes a selected one', () => {
    expect(toggleSelection([], 'A1')).toEqual(['A1'])
    expect(toggleSelection(['A1', 'A2'], 'A1')).toEqual(['A2'])
  })
})

describe('toCriteria', () => {
  it('returns empty criteria for defaults', () => {
    expect(toCriteria(DEFAULT_FILTER)).toEqual({})
  })

  it('maps populated inputs into a criteria object', () => {
    expect(toCriteria({ direction: 'up', minSampleCount: '3', query: '  widget ' })).toEqual({
      direction: 'up',
      minSampleCount: 3,
      query: 'widget',
    })
  })

  it('ignores non-positive or invalid sample counts', () => {
    expect(toCriteria({ direction: 'all', minSampleCount: '0', query: '' })).toEqual({})
    expect(toCriteria({ direction: 'all', minSampleCount: 'abc', query: '' })).toEqual({})
  })
})

describe('applyView', () => {
  const trends = [
    trend({ asin: 'A1', last: 10, direction: 'up', sampleCount: 3 }),
    trend({ asin: 'A2', last: 30, direction: 'down', sampleCount: 1 }),
    trend({ asin: 'A3', last: 20, direction: 'up', sampleCount: 5 }),
  ]

  it('filters then sorts trends', () => {
    const view = applyView(trends, { key: 'last', direction: 'desc' }, {
      direction: 'up',
      minSampleCount: '',
      query: '',
    })
    expect(view.map((t) => t.asin)).toEqual(['A3', 'A1'])
  })

  it('returns all trends sorted with default sort', () => {
    const view = applyView(trends, DEFAULT_SORT, DEFAULT_FILTER)
    expect(view.map((t) => t.asin)).toEqual(['A2', 'A3', 'A1'])
  })
})

describe('ariaSort', () => {
  it('reports the active column direction and none otherwise', () => {
    expect(ariaSort({ key: 'last', direction: 'asc' }, 'last')).toBe('ascending')
    expect(ariaSort({ key: 'last', direction: 'desc' }, 'last')).toBe('descending')
    expect(ariaSort({ key: 'last', direction: 'asc' }, 'asin')).toBe('none')
  })
})