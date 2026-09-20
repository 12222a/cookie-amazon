import {
  ANALYSIS_VIEW_TYPES,
  normalizeAnalysisViewSpec,
  type AnalysisEvidence,
  type AnalysisKeywordRow,
  type AnalysisReviewEvidence,
  type AnalysisViewSpec,
  type AnalysisViewType,
} from '@cookie-amazon/protocol'
import { renderKeywordTrend } from './keyword-trend-view'

const viewTitle: Record<AnalysisViewType, string> = {
  'object-summary': '前台基础信息',
  'keyword-summary': '词位概览',
  'keyword-table': '关键词明细',
  'keyword-trend': '搜索量趋势',
  'review-summary': '评论概览',
  'review-pain-points': '评论痛点',
  'research-record': '小组研究记录',
}

const element = (document: Document, tag: string, className?: string): HTMLElement => {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

const card = (document: Document, label: string, value: string | number): HTMLElement => {
  const node = element(document, 'div', 'panel-summary-card')
  const name = element(document, 'span')
  name.textContent = label
  const amount = element(document, 'strong')
  amount.textContent = String(value)
  node.append(name, amount)
  return node
}

const heading = (document: Document, title: string): HTMLElement => {
  const node = element(document, 'article', 'panel-analysis-view')
  const titleNode = element(document, 'h3')
  titleNode.textContent = title
  node.append(titleNode)
  return node
}

const renderObjectSummary = (document: Document, evidence: AnalysisEvidence): HTMLElement => {
  const node = heading(document, viewTitle['object-summary'])
  const cards = element(document, 'div', 'panel-summary-cards')
  cards.append(card(document, 'ASIN', evidence.asin), card(document, '站点', evidence.market))
  const object = evidence.object
  if (object.title !== null) cards.append(card(document, '标题', object.title))
  if (object.price !== null) cards.append(card(document, '价格', object.price))
  if (object.rating !== null) cards.append(card(document, '评分', object.rating))
  if (object.reviews !== null) cards.append(card(document, '评论数', object.reviews))
  // 与下方关键词表的「广告位」区分：那是排名，这是「是不是广告位商品」的标记。
  if (object.sponsored !== null) cards.append(card(document, 'Sponsored 标记', object.sponsored ? '是' : '否'))
  node.append(cards)
  return node
}

const renderKeywordSummary = (document: Document, evidence: AnalysisEvidence): HTMLElement | null => {
  if (!evidence.keyword) return null
  const node = heading(document, viewTitle['keyword-summary'])
  const cards = element(document, 'div', 'panel-summary-cards')
  cards.append(
    card(document, '关键词总数', evidence.keyword.summary.totalKeywords),
    card(document, '有自然排名', evidence.keyword.summary.rankedKeywords),
    card(document, '有广告排名', evidence.keyword.summary.adKeywords),
  )
  node.append(cards)
  // 来源类型是「这个词靠什么出单」的一半信息，收进抽屉也要跟着走。
  if (evidence.keyword.summary.sourceTypeCounts.length > 0) {
    const sourceTypes = element(document, 'div', 'panel-source-types')
    const title = element(document, 'h4')
    title.textContent = '来源类型'
    const list = element(document, 'ul')
    for (const item of evidence.keyword.summary.sourceTypeCounts) {
      const row = element(document, 'li')
      const name = element(document, 'span')
      name.textContent = item.label
      const count = element(document, 'strong')
      count.textContent = String(item.count)
      row.append(name, count)
      list.append(row)
    }
    sourceTypes.append(title, list)
    node.append(sourceTypes)
  }
  return node
}

const renderKeywordTable = (document: Document, evidence: AnalysisEvidence): HTMLElement | null => {
  if (!evidence.keyword || evidence.keyword.rows.length === 0) return null
  const node = heading(document, viewTitle['keyword-table'])
  const wrap = element(document, 'div', 'panel-table-wrap')
  const table = document.createElement('table')
  table.className = 'panel-table'
  const head = document.createElement('thead')
  const headRow = document.createElement('tr')
  for (const label of ['关键词', '自然位', '广告位', '自然流量', '广告流量', '位置类型', '搜索量趋势']) {
    const th = document.createElement('th')
    th.scope = 'col'
    th.textContent = label
    headRow.append(th)
  }
  head.append(headRow)
  const body = document.createElement('tbody')
  for (const row of evidence.keyword.rows) {
    const tr = document.createElement('tr')
    for (const value of [row.keyword, row.natural, row.ad, row.naturalShare, row.adShare, row.types]) {
      const td = document.createElement('td')
      td.textContent = value
      tr.append(td)
    }
    const trend = document.createElement('td')
    trend.className = 'panel-trend-cell'
    trend.append(renderKeywordTrend(document, row.trend))
    tr.append(trend)
    body.append(tr)
  }
  table.append(head, body)
  wrap.append(table)
  node.append(wrap)
  return node
}

const renderKeywordTrendView = (document: Document, evidence: AnalysisEvidence): HTMLElement | null => {
  if (!evidence.keyword) return null
  const rows = evidence.keyword.rows.filter((row) => row.trend.kind === 'line')
  if (rows.length === 0) return null
  const node = heading(document, viewTitle['keyword-trend'])
  const list = element(document, 'div', 'panel-analysis-trends')
  for (const row of rows.slice(0, 20)) {
    const item = element(document, 'div', 'panel-analysis-trend')
    const label = element(document, 'span')
    label.textContent = row.keyword
    item.append(label, renderKeywordTrend(document, row.trend))
    list.append(item)
  }
  node.append(list)
  return node
}

const renderReviewSummary = (document: Document, evidence: AnalysisEvidence): HTMLElement | null => {
  if (!evidence.reviews) return null
  const node = heading(document, viewTitle['review-summary'])
  const cards = element(document, 'div', 'panel-summary-cards')
  cards.append(
    card(document, '评论样本', evidence.reviews.sampled + ' / ' + evidence.reviews.total),
    card(document, '低星样本', evidence.reviews.lowStarCount),
    card(document, '痛点主题', evidence.reviews.sampleSufficient ? evidence.reviews.painPoints.length : '—'),
  )
  const coverage = element(document, 'p', 'panel-review-coverage')
  coverage.textContent = evidence.reviews.total > 0
    ? '覆盖度 ' + (evidence.reviews.coverage * 100).toFixed(1) + '%'
    : 'SellerSprite 未返回评论总数，当前只展示已取到的样本。'
  if (!evidence.reviews.sampleSufficient) coverage.textContent += ' 样本不足，暂不生成痛点结论。'
  node.append(cards, coverage)
  return node
}

const renderReviewPainPoints = (document: Document, evidence: AnalysisEvidence): HTMLElement | null => {
  if (!evidence.reviews || evidence.reviews.painPoints.length === 0) return null
  const node = heading(document, viewTitle['review-pain-points'])
  const list = element(document, 'div', 'panel-pain-points')
  renderReviewPainPointItems(document, list, evidence.reviews)
  node.append(list)
  return node
}

export const renderReviewPainPointItems = (document: Document, list: HTMLElement, reviews: AnalysisReviewEvidence): void => {
  list.replaceChildren()
  for (const pain of reviews.painPoints) {
    const details = document.createElement('details')
    details.className = 'panel-pain-point'
    const summary = document.createElement('summary')
    summary.textContent = pain.label + ' · ' + pain.count + ' 次 · 低星 ' + (pain.lowStarShare * 100).toFixed(0) + '%'
    details.append(summary)
    const meta = element(document, 'p', 'panel-pain-point-meta')
    meta.textContent = '涉及 ' + pain.asinCount + ' 个 ASIN · 平均 ' + pain.averageStar.toFixed(1) + ' 星'
    details.append(meta)
    if (pain.excerpts.length > 0) {
      const excerpts = document.createElement('ul')
      excerpts.className = 'panel-pain-point-excerpts'
      for (const excerpt of pain.excerpts) {
        const item = document.createElement('li')
        item.textContent = excerpt
        excerpts.append(item)
      }
      details.append(excerpts)
    }
    list.append(details)
  }
}

const renderRecord = (document: Document, evidence: AnalysisEvidence): HTMLElement | null => {
  if (!evidence.record) return null
  const node = heading(document, viewTitle['research-record'])
  const body = element(document, 'p', 'panel-analysis-record')
  body.textContent = evidence.record.summary
    ? evidence.record.owner + ' · ' + evidence.record.status + ' · ' + evidence.record.summary
    : evidence.record.owner + ' · ' + evidence.record.status + ' · 暂无摘要'
  node.append(body)
  return node
}

const renderOne = (document: Document, type: AnalysisViewType, evidence: AnalysisEvidence): HTMLElement | null => {
  const view = renderByType(document, type, evidence)
  // 视图类型是这个组件的身份：内嵌视图与抽屉分区靠它对应上，点内嵌视图的入口才能定位到分区。
  if (view) view.dataset.view = type
  return view
}

const renderByType = (document: Document, type: AnalysisViewType, evidence: AnalysisEvidence): HTMLElement | null => {
  if (type === 'object-summary') return renderObjectSummary(document, evidence)
  if (type === 'keyword-summary') return renderKeywordSummary(document, evidence)
  if (type === 'keyword-table') return renderKeywordTable(document, evidence)
  if (type === 'keyword-trend') return renderKeywordTrendView(document, evidence)
  if (type === 'review-summary') return renderReviewSummary(document, evidence)
  if (type === 'review-pain-points') return renderReviewPainPoints(document, evidence)
  return renderRecord(document, evidence)
}

/**
 * 数据抽屉的分区：与内嵌视图同一套组件、同一份证据包，因此两处不可能出现不同的数字。
 *
 * 分区集合由证据包决定，未知类型在 normalizeAnalysisViewSpec 里就被丢掉，这里拿到的
 * 只会是固定类型。研究记录分区不在这里渲染——那是抽屉里可写的表单，由面板自己维护。
 */
export const renderDrawerPartitions = (
  document: Document,
  container: HTMLElement,
  evidence: AnalysisEvidence,
): void => {
  // 逐个请求全部固定类型，由同一份可用性规则筛掉证据里没有的：抽屉与回答里的内嵌视图
  // 因此对「哪些类型可用」只有一套判断，未读到的数据不会在抽屉里占一个空分区。
  const types = normalizeAnalysisViewSpec({ schemaVersion: 1, views: [...ANALYSIS_VIEW_TYPES] }, evidence).views
    .filter((type) => type !== 'research-record')
  const views = types.map((type) => renderOne(document, type, evidence)).filter((view): view is HTMLElement => view !== null)
  container.replaceChildren(...views)
}

/**
 * 气泡里只放得下摘要，宽表退成一个指向数据抽屉的入口。目前只有词位表是宽表：
 * 它的列多到在面板宽度里读不动，而概览卡、趋势、痛点都是气泡里读得完的。
 */
const ENTRY_TYPES: readonly AnalysisViewType[] = ['keyword-table']

/** 入口文案里的条数取自证据包，与抽屉里那张表是同一份数据——两处不会出现不同的行数。 */
const entryLabel = (type: AnalysisViewType, evidence: AnalysisEvidence): string => type === 'keyword-table'
  ? '查看' + viewTitle[type] + '（' + (evidence.keyword?.rows.length ?? 0) + ' 条）'
  : '查看' + viewTitle[type]

/**
 * 气泡里的内嵌视图：摘要类就地渲染，宽表退成一个指向数据抽屉的入口。
 *
 * 整表不进气泡（ADR-0005）：词位表这类宽表在面板宽度里读不动，塞进气泡会挤掉对话本身。
 * 入口与抽屉里的分区共用同一批组件与同一份证据包，入口文案里的条数也就来自那张表本身。
 *
 * 与抽屉分区同样走 normalizeAnalysisViewSpec：未知类型在那里就被丢掉，
 * 规格与数据不匹配时降级为表格，重复请求同一份数据得到同一个视图。
 */
export const renderBubbleViews = (
  document: Document,
  container: HTMLElement,
  spec: AnalysisViewSpec,
  evidence: AnalysisEvidence,
  onOpenDrawer: (type: AnalysisViewType) => void,
): void => {
  const types = normalizeAnalysisViewSpec(spec, evidence).views
  const nodes = types.map((type) => {
    if (!ENTRY_TYPES.includes(type)) return renderOne(document, type, evidence)
    const entry = document.createElement('button')
    entry.type = 'button'
    entry.className = 'panel-view-entry'
    entry.dataset.entry = type
    entry.textContent = entryLabel(type, evidence)
    entry.addEventListener('click', () => onOpenDrawer(type))
    return entry
  }).filter((node): node is HTMLElement => node !== null)
  container.replaceChildren(...nodes)
}

export type { AnalysisKeywordRow }
