import { describe, expect, it } from 'vitest'
import { describeAnalysisObject } from '../panel/panel-state'
import { createAnalysisObject, type CreateAnalysisObjectInput } from '../analysis-object'

const object = (overrides: Partial<CreateAnalysisObjectInput> & { asin: string }) =>
  createAnalysisObject({ market: 'US', source: 'manual', now: 1_700_000_000_000, ...overrides })!

describe('describeAnalysisObject', () => {
  it('shows the empty state when there is no object', () => {
    expect(describeAnalysisObject(null)).toEqual({ kind: 'empty' })
  })

  it('labels the manual source so the user knows where the object came from', () => {
    const state = describeAnalysisObject(object({ asin: 'B07Z82895W' })!)
    expect(state).toMatchObject({ kind: 'ready', asin: 'B07Z82895W', market: 'US', sourceLabel: '手动输入' })
  })

  it('labels the storefront source differently', () => {
    const state = describeAnalysisObject(object({ asin: 'B07Z82895W', source: 'storefront' })!)
    expect(state).toMatchObject({ kind: 'ready', sourceLabel: '搜索页选中' })
  })

  it('renders every storefront field as a dash when nothing was read yet', () => {
    const state = describeAnalysisObject(object({ asin: 'B07Z82895W' })!)
    expect(state.kind === 'ready' ? state.fields : []).toEqual([
      { label: '标题', value: '—' },
      { label: '价格', value: '—' },
      { label: '评分', value: '—' },
      { label: '评论数', value: '—' },
      { label: '广告位', value: '—' },
      { label: '归属人', value: '—' },
      { label: '小组', value: '—' },
    ])
  })

  it('formats the storefront fields that were read', async () => {
    const state = describeAnalysisObject(object({
      asin: 'B07Z82895W',
      source: 'storefront',
      owner: 'amy',
      group: 'team-a',
      storefront: { title: 'Phone Stand', price: 9.99, rating: 4.7, reviews: 1234, sponsored: true },
    })!)
    expect(state.kind === 'ready' ? state.fields : []).toEqual([
      { label: '标题', value: 'Phone Stand' },
      { label: '价格', value: '$9.99' },
      { label: '评分', value: '4.7' },
      { label: '评论数', value: '1,234' },
      { label: '广告位', value: '是' },
      { label: '归属人', value: 'amy' },
      { label: '小组', value: 'team-a' },
    ])
  })

  it('marks a non-sponsored result rather than leaving the field blank', () => {
    const state = describeAnalysisObject(object({
      asin: 'B07Z82895W', source: 'storefront',
      storefront: { title: null, price: null, rating: null, reviews: null, sponsored: false },
    })!)
    const sponsored = state.kind === 'ready' ? state.fields.find((field) => field.label === '广告位') : null
    expect(sponsored?.value).toBe('否')
  })
})
