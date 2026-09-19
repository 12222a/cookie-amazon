import { describe, expect, it } from 'vitest'
import {
  canEditRecord,
  createResearchRecord,
  isResearchRecord,
  updateResearchRecord,
} from '../research-record'

const base = {
  asin: 'B07Z82895W',
  market: 'US',
  owner: 'amy',
  group: 'team-a',
  now: 1_700_000_000_000,
}

describe('createResearchRecord', () => {
  it('records who studied it, in which group, and when', () => {
    expect(createResearchRecord({ ...base, summary: ' 值得继续看 ' })).toEqual({
      asin: 'B07Z82895W',
      market: 'US',
      owner: 'amy',
      group: 'team-a',
      status: 'researching',
      summary: '值得继续看',
      updatedAt: 1_700_000_000_000,
    })
  })

  it('normalizes the ASIN and market so two people typing differently still share one record', () => {
    const record = createResearchRecord({ ...base, asin: ' b07z82895w ', market: 'us', summary: '' })
    expect(record?.asin).toBe('B07Z82895W')
    expect(record?.market).toBe('US')
  })

  it('refuses a record with no owner or no group, because归属 is the whole point', () => {
    expect(createResearchRecord({ ...base, owner: '  ', summary: '' })).toBeNull()
    expect(createResearchRecord({ ...base, group: '', summary: '' })).toBeNull()
  })

  it('refuses an unusable ASIN', () => {
    expect(createResearchRecord({ ...base, asin: 'nope', summary: '' })).toBeNull()
  })
})

describe('updateResearchRecord', () => {
  const record = createResearchRecord({ ...base, summary: 'first' })!

  it('lets the owner change the summary and status, and stamps the new time', () => {
    const updated = updateResearchRecord(record, { summary: '  revised  ', status: 'verified', now: 1_700_000_100_000 })
    expect(updated).toEqual({
      ...record,
      summary: 'revised',
      status: 'verified',
      updatedAt: 1_700_000_100_000,
    })
  })

  it('never lets the update move the record to another owner or group', () => {
    const updated = updateResearchRecord(record, {
      summary: 'x',
      status: 'rejected',
      owner: 'someone-else',
      group: 'team-b',
    } as never)
    expect(updated?.owner).toBe('amy')
    expect(updated?.group).toBe('team-a')
  })

  it('refuses an unknown status instead of storing it', () => {
    expect(updateResearchRecord(record, { summary: 'x', status: 'maybe' as never })).toBeNull()
  })
})

describe('canEditRecord', () => {
  const record = createResearchRecord({ ...base, summary: '' })!

  it('allows the author', () => {
    expect(canEditRecord(record, { name: 'amy', group: 'team-a' })).toBe(true)
  })

  it('refuses a colleague, even one in the same group', () => {
    expect(canEditRecord(record, { name: 'ben', group: 'team-a' })).toBe(false)
  })

  it('refuses when the viewer has no identity yet', () => {
    expect(canEditRecord(record, null)).toBe(false)
  })
})


describe('isResearchRecord', () => {
  it('accepts a complete record', () => {
    expect(isResearchRecord({
      asin: 'B07Z82895W', market: 'US', owner: 'amy', group: 'team-a',
      status: 'researching', summary: '', updatedAt: 1,
    })).toBe(true)
  })

  it('rejects stale or partial storage so the panel never renders half a record', () => {
    expect(isResearchRecord(null)).toBe(false)
    expect(isResearchRecord({ asin: 'B07Z82895W' })).toBe(false)
    expect(isResearchRecord({
      asin: 'B07Z82895W', market: 'US', owner: 'amy', group: 'team-a',
      status: 'unknown', summary: '', updatedAt: 1,
    })).toBe(false)
  })
})

