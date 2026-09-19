import { describe, expect, it } from 'vitest'
import { describeColleagueRecord, describeRecordForOwner } from '../panel/research-panel-state'
import { createResearchRecord } from '../research-record'

const record = (overrides: Partial<Parameters<typeof createResearchRecord>[0]> = {}) =>
  createResearchRecord({
    asin: 'B07Z82895W', market: 'US', owner: 'amy', group: 'team-a', summary: '',
    now: 1_700_000_000_000, ...overrides,
  })!

describe('describeColleagueRecord', () => {
  it('says nobody has looked when there is no record', () => {
    expect(describeColleagueRecord(null)).toEqual({
      kind: 'none',
      note: '本小组还没有人研究过这个 ASIN。',
    })
  })

  it('names the colleague so the user knows who to ask', () => {
    expect(describeColleagueRecord(record({ owner: 'ben' }))).toMatchObject({
      kind: 'colleague',
      owner: 'ben',
    })
  })

  it('shows the summary when the colleague wrote one', () => {
    const state = describeColleagueRecord(record({ owner: 'ben', summary: '广告占比过高，先观察' }))
    expect(state.note).toContain('广告占比过高，先观察')
  })

  it('labels the status in words rather than the raw code', () => {
    expect(describeColleagueRecord(record({ status: 'verified' })).note).toContain('已验证')
    expect(describeColleagueRecord(record({ status: 'rejected' })).note).toContain('已否决')
    expect(describeColleagueRecord(record({ status: 'researching' })).note).toContain('研究中')
  })
})

describe('describeRecordForOwner', () => {
  it('tells the author they can edit their own record', () => {
    const state = describeRecordForOwner(record({ summary: 'x' }))
    expect(state.editable).toBe(true)
  })

  it('hands back the fields the form should be pre-filled with', () => {
    const state = describeRecordForOwner(record({ summary: 'first pass', status: 'verified' }))
    expect(state.summary).toBe('first pass')
    expect(state.status).toBe('verified')
  })

  it('leaves the form empty when the author has not written anything yet', () => {
    const state = describeRecordForOwner(null)
    expect(state.summary).toBe('')
    expect(state.status).toBe('researching')
  })
})
