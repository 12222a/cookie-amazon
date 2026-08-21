import type {
  SellerSpriteAbaMarket,
  SellerSpriteAbaPeriodsData,
  SellerSpriteAbaReverseType,
} from '@cookie-amazon/protocol'

const ABA_MARKET_BY_STATION: Readonly<Record<string, SellerSpriteAbaMarket>> = {
  US: 'COM',
  CA: 'CA',
  GB: 'GB',
  DE: 'DE',
  FR: 'FR',
  JP: 'JP',
  IT: 'IT',
  ES: 'ES',
  IN: 'IN',
  MX: 'MX',
}

export const getAbaMarket = (station: string): SellerSpriteAbaMarket | undefined =>
  ABA_MARKET_BY_STATION[station]

export const hasAbaCapabilities = (capabilities: readonly string[] | null | undefined): boolean =>
  capabilities?.includes('SELLERSPRITE_ABA_PERIODS') === true
  && capabilities.includes('SELLERSPRITE_ABA_RESEARCH')

export const describeAbaExtensionError = (
  code: string,
  extensionVersion?: string,
): string => code === 'EXTENSION_UNAVAILABLE'
  ? `扩展 ABA 通道不可用${extensionVersion ? `（当前 v${extensionVersion}）` : ''}。请在 chrome://extensions 重新加载扩展，再刷新本页面。`
  : code

export type AbaSearchPreparation = {
  market: SellerSpriteAbaMarket
  table: string
  periods: SellerSpriteAbaPeriodsData | null
}

export const prepareAbaSearch = async (
  input: {
    targetReady: boolean
    station: string
    keyword: string
    reverseType: SellerSpriteAbaReverseType
    table: string
  },
  loadPeriods: () => Promise<SellerSpriteAbaPeriodsData>,
): Promise<AbaSearchPreparation> => {
  if (!input.targetReady) throw new Error('请先连接 SellerSprite')
  if (input.keyword.trim() === '') throw new Error('请输入 ABA 关键词')

  const market = getAbaMarket(input.station)
  if (market === undefined) throw new Error(`站点 ${input.station} 暂不支持 ABA 查询`)
  if (input.table !== '') return { market, table: input.table, periods: null }

  const periods = await loadPeriods()
  const options = input.reverseType === 'W' ? periods.weekTables : periods.monthTables
  const table = options[0]?.table
  if (table === undefined) {
    throw new Error(`SellerSprite 未返回可用的${input.reverseType === 'W' ? '周度' : '月度'} ABA 周期`)
  }
  return { market, table, periods }
}