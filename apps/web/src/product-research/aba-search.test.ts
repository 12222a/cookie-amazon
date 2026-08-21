import { describe, expect, it, vi } from 'vitest'
import { prepareAbaSearch } from './aba-search'

const periods = {
  weekTables: [{ table: 'ara_20260815', label: '20260815' }],
  monthTables: [{ table: 'ara_202607', label: '202607' }],
}

describe('prepareAbaSearch', () => {
  it('reuses an already selected period without another request', async () => {
    const loadPeriods = vi.fn()
    await expect(prepareAbaSearch({
      targetReady: true,
      station: 'US',
      keyword: 'screen protector',
      reverseType: 'W',
      table: 'ara_20260815',
    }, loadPeriods)).resolves.toEqual({ market: 'COM', table: 'ara_20260815', periods: null })
    expect(loadPeriods).not.toHaveBeenCalled()
  })

  it('reloads periods and selects the latest table when initialization left it empty', async () => {
    const loadPeriods = vi.fn().mockResolvedValue(periods)
    await expect(prepareAbaSearch({
      targetReady: true,
      station: 'US',
      keyword: 'screen protector',
      reverseType: 'M',
      table: '',
    }, loadPeriods)).resolves.toEqual({ market: 'COM', table: 'ara_202607', periods })
    expect(loadPeriods).toHaveBeenCalledTimes(1)
  })

  it('reports the exact unavailable condition', async () => {
    await expect(prepareAbaSearch({
      targetReady: true,
      station: 'AU',
      keyword: 'screen protector',
      reverseType: 'W',
      table: '',
    }, vi.fn())).rejects.toThrow('站点 AU 暂不支持 ABA 查询')

    await expect(prepareAbaSearch({
      targetReady: true,
      station: 'US',
      keyword: 'screen protector',
      reverseType: 'W',
      table: '',
    }, vi.fn().mockResolvedValue({ weekTables: [], monthTables: [] })))
      .rejects.toThrow('SellerSprite 未返回可用的周度 ABA 周期')
  })
})