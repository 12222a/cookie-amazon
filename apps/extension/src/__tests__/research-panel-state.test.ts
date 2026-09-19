import { describe, expect, it } from 'vitest'
import { describeColleagueRecord, describeRecordAge, describeRecordForOwner } from '../panel/research-panel-state'
import type { DisplayableRecord } from '../panel/research-panel-state'

const updatedAt = 1_700_000_000_000
/** 展示层只要这几个字段；老测试用完整记录构造，现在直接给形状即可。 */
const record = (overrides: Partial<DisplayableRecord> = {}): DisplayableRecord => ({
  owner: 'amy', status: 'researching', summary: '', updatedAt, ...overrides,
})

describe('describeRecordAge', () => {
  it('says just now for a fresh record', () => {
    expect(describeRecordAge(updatedAt, updatedAt)).toBe('刚刚')
  })

  it('counts minutes, hours, days and months', () => {
    expect(describeRecordAge(updatedAt, updatedAt + 5 * 60_000)).toBe('5 分钟前')
    expect(describeRecordAge(updatedAt, updatedAt + 3 * 3_600_000)).toBe('3 小时前')
    expect(describeRecordAge(updatedAt, updatedAt + 2 * 86_400_000)).toBe('2 天前')
    expect(describeRecordAge(updatedAt, updatedAt + 70 * 86_400_000)).toBe('2 个月前')
  })

  it('admits when the clock is unusable rather than inventing an age', () => {
    expect(describeRecordAge(Number.NaN, updatedAt)).toBe('时间未知')
    expect(describeRecordAge(updatedAt + 1000, updatedAt)).toBe('时间未知')
  })
})

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

  it('states when the colleague last touched it, because a stale verdict reads differently', () => {
    const state = describeColleagueRecord(record({ owner: 'ben', updatedAt: Date.now() - 3 * 86_400_000 }))
    expect(state.kind === 'colleague' ? state.ageLabel : '').toBe('3 天前')
    expect(state.note).toContain('3 天前')
  })
})

describe('describeRecordForOwner', () => {
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
