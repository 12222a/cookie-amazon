import {
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
  if (type === 'object-summary') return renderObjectSummary(document, evidence)
  if (type === 'keyword-summary') return renderKeywordSummary(document, evidence)
  if (type === 'keyword-table') return renderKeywordTable(document, evidence)
  if (type === 'keyword-trend') return renderKeywordTrendView(document, evidence)
  if (type === 'review-summary') return renderReviewSummary(document, evidence)
  if (type === 'review-pain-points') return renderReviewPainPoints(document, evidence)
  return renderRecord(document, evidence)
}

export const renderAnalysisViews = (
  document: Document,
  container: HTMLElement,
  spec: AnalysisViewSpec,
  evidence: AnalysisEvidence,
): void => {
  const normalized = normalizeAnalysisViewSpec(spec, evidence)
  const views = normalized.views.map((type) => renderOne(document, type, evidence)).filter((view): view is HTMLElement => view !== null)
  container.replaceChildren(...views)
}

export type { AnalysisKeywordRow }
