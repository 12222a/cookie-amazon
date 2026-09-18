import type { AnalysisObject } from '../analysis-object'

export type PanelField = { label: string; value: string }

export type PanelState =
  | { kind: 'empty' }
  | {
      kind: 'ready'
      asin: string
      market: string
      sourceLabel: string
      fields: PanelField[]
    }

const SOURCE_LABELS: Record<AnalysisObject['source'], string> = {
  manual: '手动输入',
  storefront: '搜索页选中',
}

const EMPTY = '—'

const text = (value: string | null): string => value === null || value.length === 0 ? EMPTY : value

const money = (value: number | null): string =>
  value === null ? EMPTY : `$${value.toFixed(2)}`

const number = (value: number | null): string =>
  value === null ? EMPTY : value.toLocaleString('en-US')

const rating = (value: number | null): string => value === null ? EMPTY : value.toFixed(1)

/** 三态里只有「有没有对象」影响面板内容，所以这里不引入状态机。 */
const sponsored = (value: boolean | null): string =>
  value === null ? EMPTY : value ? '是' : '否'

/**
 * 把分析对象翻译成面板要渲染的字段。
 *
 * 缺失一律显示破折号——不显示 0，也不省略该行，否则用户分不清「没有数据」和「数据是零」。
 */
export const describeAnalysisObject = (object: AnalysisObject | null): PanelState => {
  if (object === null) return { kind: 'empty' }
  const storefront = object.storefront
  return {
    kind: 'ready',
    asin: object.asin,
    market: object.market,
    sourceLabel: SOURCE_LABELS[object.source],
    fields: [
      { label: '标题', value: text(storefront?.title ?? null) },
      { label: '价格', value: money(storefront?.price ?? null) },
      { label: '评分', value: rating(storefront?.rating ?? null) },
      { label: '评论数', value: number(storefront?.reviews ?? null) },
      { label: '广告位', value: sponsored(storefront?.sponsored ?? null) },
      { label: '归属人', value: text(object.owner) },
      { label: '小组', value: text(object.group) },
    ],
  }
}
