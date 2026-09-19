import '../../src/panel/panel.css'
import { AnalysisObjectStore, ANALYSIS_OBJECT_STORAGE_KEY } from '../../src/analysis-object-store'
import { createAnalysisObject, DEFAULT_MARKET, type AnalysisObject } from '../../src/analysis-object'
import { askAnalysis, type AnalysisResult } from '../../src/panel/analysis-client'
import { buildAnalysisEvidence } from '../../src/panel/analysis-evidence'
import { renderAnalysisViews, renderReviewPainPointItems } from '../../src/panel/analysis-view'
import { describeAnalysisObject } from '../../src/panel/panel-state'
import { describeColleagueRecord, describeRecordForOwner, RESEARCH_STATUS_LABELS } from '../../src/panel/research-panel-state'
import { requestKeywordPositionsCached, type CachedKeywordPositionResult } from '../../src/panel/keyword-position-cache-client'
import { KeywordPositionCache } from '../../src/panel/keyword-position-cache'
import type {
  KeywordPositionRow,
  KeywordPositionSummary,
} from '../../src/panel/keyword-positions'
import { renderKeywordTrend } from '../../src/panel/keyword-trend-view'
import { fetchSellerSpriteReviews, type ReviewCommentsResult } from '../../src/panel/review-comments-client'
import { analyzeSellerSpriteReviews, type ReviewPanelData } from '../../src/panel/review-analysis'
import { isResearchStatus, type ResearchStatus } from '../../src/research-record'
import { describeRecordResult, ResearchRecordClient } from '../../src/panel/research-record-client'
import { createViewerIdentity, describeViewer, ViewerIdentityStore, VIEWER_IDENTITY_STORAGE_KEY, type ViewerIdentity } from '../../src/viewer-identity'
import type { AnalysisAskSuccess } from '@cookie-amazon/protocol'

const objectStore = new AnalysisObjectStore(browser.storage.local)
const identityStore = new ViewerIdentityStore(browser.storage.local)
const positionCache = new KeywordPositionCache(browser.storage.local)
/**
 * 研究记录的读写在服务端（见 research-record-client），客户端不再持有记录副本：
 * 本地数组做不到跨浏览器共享，也做不到组间隔离。
 */
let recordClient: ResearchRecordClient | null = null

const sourceElement = document.querySelector<HTMLParagraphElement>('#source')
const viewerElement = document.querySelector<HTMLParagraphElement>('#viewer')
const identitySection = document.querySelector<HTMLElement>('#identity')
const identityForm = document.querySelector<HTMLFormElement>('#identity-form')
/** 访问密钥输入框。id 沿用 viewer-name，避免一次性改掉样式与测试选择器。 */
const tokenInput = document.querySelector<HTMLInputElement>('#viewer-name')
const clearTokenButton = document.querySelector<HTMLButtonElement>('#viewer-clear')
const identityError = document.querySelector<HTMLParagraphElement>('#identity-error')
const emptyElement = document.querySelector<HTMLElement>('#empty')
const objectElement = document.querySelector<HTMLElement>('#object')
const fieldsElement = document.querySelector<HTMLDListElement>('#fields')
const formElement = document.querySelector<HTMLFormElement>('#manual')
  const inputElement = document.querySelector<HTMLInputElement>('#asin')
const errorElement = document.querySelector<HTMLParagraphElement>('#error')
const loadButton = document.querySelector<HTMLButtonElement>('#load-positions')
const statusElement = document.querySelector<HTMLParagraphElement>('#positions-status')
const summaryElement = document.querySelector<HTMLElement>('#positions-summary')
const summaryCardsElement = document.querySelector<HTMLElement>('#positions-summary-cards')
const sourceTypesElement = document.querySelector<HTMLElement>('#positions-source-types')
const sourceTypeListElement = document.querySelector<HTMLUListElement>('#positions-source-type-list')
const detailsElement = document.querySelector<HTMLDetailsElement>('#positions-details')
const tableWrapElement = document.querySelector<HTMLElement>('#positions-table-wrap')
const rowsElement = document.querySelector<HTMLTableSectionElement>('#positions-rows')
const loadReviewsButton = document.querySelector<HTMLButtonElement>('#load-reviews')
const reviewsStatusElement = document.querySelector<HTMLParagraphElement>('#reviews-status')
const reviewsSummaryElement = document.querySelector<HTMLElement>('#reviews-summary')
const reviewsSummaryCardsElement = document.querySelector<HTMLElement>('#reviews-summary-cards')
const reviewsCoverageElement = document.querySelector<HTMLParagraphElement>('#reviews-coverage')
const reviewPainPointsElement = document.querySelector<HTMLElement>('#review-pain-points')
const recordSection = document.querySelector<HTMLElement>('#record')
const recordOwnerElement = document.querySelector<HTMLSpanElement>('#record-owner')
const recordNoteElement = document.querySelector<HTMLParagraphElement>('#record-note')
const recordForm = document.querySelector<HTMLFormElement>('#record-form')
const recordSummaryInput = document.querySelector<HTMLTextAreaElement>('#record-summary')
const recordStatusSelect = document.querySelector<HTMLSelectElement>('#record-status')
const recordError = document.querySelector<HTMLParagraphElement>('#record-error')
const analysisSection = document.querySelector<HTMLElement>('#analysis')
const analysisForm = document.querySelector<HTMLFormElement>('#analysis-form')
const analysisQuestionInput = document.querySelector<HTMLTextAreaElement>('#analysis-question')
const analysisAskButton = document.querySelector<HTMLButtonElement>('#analysis-ask')
const analysisRetryButton = document.querySelector<HTMLButtonElement>('#analysis-retry')
const analysisStatusElement = document.querySelector<HTMLParagraphElement>('#analysis-status')
const analysisAnswerElement = document.querySelector<HTMLElement>('#analysis-answer')
const analysisAnswerQuestionElement = document.querySelector<HTMLParagraphElement>('#analysis-answer-question')
const analysisFactsElement = document.querySelector<HTMLUListElement>('#analysis-facts')
const analysisInferencesElement = document.querySelector<HTMLUListElement>('#analysis-inferences')
const analysisCitationsElement = document.querySelector<HTMLUListElement>('#analysis-citations')
const analysisViewsElement = document.querySelector<HTMLElement>('#analysis-views')
let current: AnalysisObject | null = null
let viewer: ViewerIdentity | null = null
let loading = false
let positionsTarget: string | null = null
let reviewsLoading = false
let reviewsTarget: string | null = null
let keywordRows: KeywordPositionRow[] = []
let keywordSummary: KeywordPositionSummary | null = null
let reviewData: ReviewPanelData | null = null
let analysisLoading = false
let analysisRequestId = 0
let lastAnalysis: Extract<AnalysisResult, { kind: 'answer' }> | null = null
let lastAnalysisEvidence: Parameters<typeof renderAnalysisViews>[3] | null = null
let lastAnalysisQuestion = ''

const positionTargetKey = (target: AnalysisObject): string => target.asin + ':' + target.market

const setError = (message: string | null): void => {
  if (!errorElement) return
  errorElement.hidden = message === null
  errorElement.textContent = message ?? ''
}

const setIdentityError = (message: string | null): void => {
  if (!identityError) return
  identityError.hidden = message === null
  identityError.textContent = message ?? ''
}

const setRecordError = (message: string | null): void => {
  if (!recordError) return
  recordError.hidden = message === null
  recordError.textContent = message ?? ''
}

/**
 * 把研究记录区恢复到「不知道有任何记录」的状态。
 *
 * 换身份或退出时必须走过这里：留着上一个身份的 owner 与摘要，
 * 等于把别组的结论显示给了没有权限的人。
 */
const clearRecordPanel = (): void => {
  if (recordOwnerElement) recordOwnerElement.textContent = ''
  if (recordNoteElement) {
    recordNoteElement.hidden = false
    recordNoteElement.textContent = ''
  }
  if (recordForm) recordForm.hidden = true
  if (recordSummaryInput) recordSummaryInput.value = ''
  setRecordError(null)
}

const setStatus = (message: string | null): void => {
  if (!statusElement) return
  statusElement.hidden = message === null
  statusElement.textContent = message ?? ''
}

const setAnalysisStatus = (message: string | null, error = false): void => {
  if (!analysisStatusElement) return
  analysisStatusElement.hidden = message === null
  analysisStatusElement.textContent = message ?? ''
  analysisStatusElement.dataset.kind = error ? 'error' : 'info'
}

const renderAnalysisList = (element: HTMLUListElement | null, values: readonly string[]): void => {
  element?.replaceChildren(...values.map((value) => {
    const item = document.createElement('li')
    item.textContent = value
    return item
  }))
}

const ANALYSIS_SOURCE_LABELS: Record<string, string> = {
  storefront: '亚马逊前台',
  sellersprite: 'SellerSprite',
  derived: '计算结果',
  'research-record': '小组研究记录',
}

const renderAnalysisAnswer = (): void => {
  const response: AnalysisAskSuccess | null = lastAnalysis?.response ?? null
  if (analysisAnswerElement) analysisAnswerElement.hidden = response === null
  if (analysisAnswerQuestionElement) analysisAnswerQuestionElement.textContent = response === null ? '' : '问题：' + lastAnalysisQuestion
  renderAnalysisList(analysisFactsElement, response?.answer.facts ?? [])
  renderAnalysisList(analysisInferencesElement, response?.answer.inferences ?? [])
  analysisCitationsElement?.replaceChildren(...(response?.answer.citations ?? []).map((citation) => {
    const item = document.createElement('li')
    item.textContent = citation.label + '：' + citation.value + '（' + (ANALYSIS_SOURCE_LABELS[citation.source] ?? citation.source) + '）'
    return item
  }))
  if (response && lastAnalysisEvidence && analysisViewsElement) {
    renderAnalysisViews(document, analysisViewsElement, response.view, lastAnalysisEvidence)
  } else {
    analysisViewsElement?.replaceChildren()
  }
}

const clearAnalysisAnswer = (message: string | null = null): void => {
  lastAnalysis = null
  lastAnalysisEvidence = null
  lastAnalysisQuestion = ''
  renderAnalysisAnswer()
  setAnalysisStatus(message)
  if (analysisRetryButton) analysisRetryButton.hidden = true
}

const resetAnalysisForTarget = (message: string | null = null): void => {
  analysisRequestId += 1
  analysisLoading = false
  if (analysisAskButton) analysisAskButton.disabled = false
  clearAnalysisAnswer(message)
}

const renderFields = (fields: readonly { label: string; value: string }[]): void => {
  if (!fieldsElement) return
  fieldsElement.replaceChildren(...fields.flatMap((field) => {
    const term = document.createElement('dt')
    term.textContent = field.label
    const value = document.createElement('dd')
    value.textContent = field.value
    return [term, value]
  }))
}

const setReviewsStatus = (message: string | null): void => {
  if (!reviewsStatusElement) return
  reviewsStatusElement.hidden = message === null
  reviewsStatusElement.textContent = message ?? ''
}

const renderReviewData = (data: ReviewPanelData | null): void => {
  if (reviewsSummaryElement) reviewsSummaryElement.hidden = data === null
  reviewsSummaryCardsElement?.replaceChildren()
  if (reviewPainPointsElement) {
    reviewPainPointsElement.hidden = data === null || data.painPoints.length === 0
    reviewPainPointsElement.replaceChildren()
  }
  if (reviewsCoverageElement) reviewsCoverageElement.textContent = ''
  if (data === null) return

  const lowStarShare = data.sampled === 0 ? 0 : data.lowStarCount / data.sampled
  const cards = [
    { label: '评论样本', value: data.sampled + ' / ' + data.total },
    { label: '低星样本', value: data.lowStarCount + ' / ' + data.sampled },
    { label: '痛点主题', value: data.sampleSufficient ? data.painPoints.length : '—' },
  ]
  reviewsSummaryCardsElement?.replaceChildren(...cards.map(({ label, value }) => {
    const card = document.createElement('div')
    card.className = 'panel-summary-card'
    const name = document.createElement('span')
    name.textContent = label
    const count = document.createElement('strong')
    count.textContent = String(value)
    card.append(name, count)
    return card
  }))
  if (reviewsCoverageElement) {
    reviewsCoverageElement.textContent = data.total > 0
      ? '覆盖度 ' + (data.coverage * 100).toFixed(1) + '% · 低星占比 ' + (lowStarShare * 100).toFixed(1) + '%'
      : 'SellerSprite 未返回评论总数，当前只展示已取到的样本。'
  }
  if (!reviewPainPointsElement) return
  renderReviewPainPointItems(document, reviewPainPointsElement, data)
}

const describeReviewResult = (result: ReviewCommentsResult): string | null => {
  if (result.kind === 'data') {
    const data = analyzeSellerSpriteReviews(result.data)
    renderReviewData(data)
    if (!data.sampleSufficient) return '样本不足（' + data.sampled + '/6），暂不生成痛点结论。'
    if (data.painPoints.length === 0) return '已读取评论，但未形成稳定的低星痛点主题。'
    return '已读取 ' + data.sampled + ' 条评论，识别 ' + data.painPoints.length + ' 个痛点主题。'
  }
  renderReviewData(null)
  if (result.kind === 'unsupported-market') return '暂不支持 ' + result.market + ' 站的评论分析，目前只读取美国站。'
  if (result.kind === 'not-logged-in') return '卖家精灵登录已失效，请重新登录后重试。'
  if (result.kind === 'permission-required') return '尚未授权卖家精灵，请在扩展弹窗中授权后重试。'
  return '读取失败（' + result.reason + '），请稍后重试。'
}

/** 空行不渲染，但保留未知列的破折号：表格要能对齐着看。 */
const renderRows = (rows: readonly KeywordPositionRow[]): void => {
  if (!rowsElement) return
  const cells = (row: KeywordPositionRow): string[] => [
    row.keyword, row.natural, row.ad, row.naturalShare, row.adShare, row.types,
  ]
  rowsElement.replaceChildren(...rows.map((row) => {
    const tr = document.createElement('tr')
    for (const text of cells(row)) {
      const td = document.createElement('td')
      td.textContent = text
      tr.append(td)
    }
    const trendCell = document.createElement('td')
    trendCell.className = 'panel-trend-cell'
    trendCell.append(renderKeywordTrend(document, row.trend))
    tr.append(trendCell)
    return tr
  }))
}

const renderSummary = (summary: KeywordPositionSummary | null): void => {
  if (summaryElement) summaryElement.hidden = summary === null
  summaryCardsElement?.replaceChildren()
  sourceTypeListElement?.replaceChildren()
  if (sourceTypesElement) sourceTypesElement.hidden = summary === null || summary.sourceTypeCounts.length === 0
  if (summary === null) return

  const cards = [
    { label: '关键词总数', value: summary.totalKeywords },
    { label: '有自然排名', value: summary.rankedKeywords },
    { label: '有广告排名', value: summary.adKeywords },
  ]
  summaryCardsElement?.replaceChildren(...cards.map(({ label, value }) => {
    const card = document.createElement('div')
    card.className = 'panel-summary-card'
    const name = document.createElement('span')
    name.textContent = label
    const count = document.createElement('strong')
    count.textContent = String(value)
    card.append(name, count)
    return card
  }))
  sourceTypeListElement?.replaceChildren(...summary.sourceTypeCounts.map(({ label, count }) => {
    const item = document.createElement('li')
    const name = document.createElement('span')
    name.textContent = label
    const value = document.createElement('strong')
    value.textContent = String(count)
    item.append(name, value)
    return item
  }))
}

/**
 * 把取数结果翻译成面板上的话。每一种失败都给出下一步该做什么，
 * 而不是把错误码直接甩给用户。
 */
const describeResult = (result: CachedKeywordPositionResult): string | null => {
  if (result.kind === 'rows') {
    const hasRows = result.rows.length > 0
    renderSummary(hasRows ? result.summary : null)
    if (detailsElement) {
      detailsElement.hidden = !hasRows
      if (!hasRows) detailsElement.open = false
    }
    if (tableWrapElement) tableWrapElement.hidden = !hasRows
    renderRows(result.rows)
    return !hasRows
      ? '这个 ASIN 当前没有可读取的关键词。'
      : '已读取 ' + result.rows.length + ' 个关键词。'
  }
  renderSummary(null)
  if (detailsElement) {
    detailsElement.hidden = true
    detailsElement.open = false
  }
  if (tableWrapElement) tableWrapElement.hidden = true
  if (result.kind === 'unsupported-market') return `暂不支持 ${result.market} 站的关键词反查，目前只读取美国站。`
  if (result.kind === 'not-logged-in') return '卖家精灵登录已失效，请重新登录后重试。'
  if (result.kind === 'permission-required') return '尚未授权卖家精灵，请在扩展弹窗中授权后重试。'
  return `读取失败（${result.reason}），请稍后重试。`
}

/**
 * 研究记录区：同组已有记录时显示是谁、什么状态、结论是什么；
 * 归属人本人则把表单打开并预填，别人只读。
 */
const renderRecord = async (): Promise<void> => {
  if (recordSection === null || current === null) return
  const target = current
  const targetKey = positionTargetKey(target)
  recordSection.hidden = false
  if (recordClient === null) {
    // 没设密钥就没有服务端身份，此时不能拿本地数组冒充隔离。
    if (recordOwnerElement) recordOwnerElement.textContent = ''
    if (recordNoteElement) {
      recordNoteElement.hidden = false
      recordNoteElement.textContent = '研究记录需要访问密钥：填写后才能看到本小组的记录。'
    }
    if (recordForm) recordForm.hidden = true
    setRecordError(null)
    return
  }
  // 可见性由服务端按密钥对应的小组决定：客户端既不指定组，也拿不到别组的记录。
  const result = await recordClient.find(target.asin, target.market)
  if (current === null || positionTargetKey(current) !== targetKey) return
  const visible = result.kind === 'found' ? result.record : null
  const colleague = describeColleagueRecord(visible)
  if (recordOwnerElement) recordOwnerElement.textContent = colleague.kind === 'colleague' ? colleague.owner : ''
  const notice = describeRecordResult(result)
  if (recordNoteElement) {
    recordNoteElement.hidden = false
    recordNoteElement.textContent = notice ?? colleague.note
  }
  // 能不能改由服务端在提交时判定；这里只在确实失败时把表单关上。
  const editable = result.kind === 'found' || result.kind === 'none'
  if (recordForm) recordForm.hidden = !editable
  const state = describeRecordForOwner(visible)
  if (recordSummaryInput && editable) recordSummaryInput.value = state.summary
  if (recordStatusSelect && editable) recordStatusSelect.value = state.status
  setRecordError(result.kind === 'unavailable' ? '暂时无法连接研究记录服务，显示的可能不是最新状态。' : null)
}

/** 缓存命中要说出来：用户不会因为「快了」而疑惑，但会因为「同样的数据为什么又出来了」而疑惑。 */
const describeCacheAge = (ageMs: number): string => {
  const minutes = Math.floor(ageMs / 60_000)
  if (minutes < 1) return '刚刚缓存'
  if (minutes < 60) return `${minutes} 分钟前的缓存`
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时前的缓存`
}

const loadPositions = async (): Promise<void> => {
  const target = current
  if (target === null || loading) return
  const targetKey = positionTargetKey(target)
  loading = true
  if (loadButton) loadButton.disabled = true
  setStatus('正在读取…')
  try {
    const result: CachedKeywordPositionResult = await requestKeywordPositionsCached(
      target.asin, target.market, { cache: positionCache },
    )
    if (positionsTarget !== targetKey) return
    resetAnalysisForTarget('词位数据已更新，请重新提问。')
    if (result.kind === 'rows') {
      keywordRows = result.rows
      keywordSummary = result.summary
    } else {
      keywordRows = []
      keywordSummary = null
    }
    const message = describeResult(result)
    setStatus(result.cached ? `${message}（${describeCacheAge(result.ageMs)}）` : message)
  } finally {
    const shouldLoadAnotherTarget = current !== null && positionsTarget !== positionTargetKey(current)
    loading = false
    if (loadButton) loadButton.disabled = false
    if (shouldLoadAnotherTarget) void loadPositions()
  }
}

const loadReviews = async (): Promise<void> => {
  const target = current
  if (target === null || reviewsLoading) return
  const targetKey = positionTargetKey(target)
  reviewsLoading = true
  if (loadReviewsButton) loadReviewsButton.disabled = true
  setReviewsStatus('正在读取评论…')
  try {
    const result = await fetchSellerSpriteReviews(target.asin, target.market)
    if (reviewsTarget !== targetKey) return
    resetAnalysisForTarget('评论数据已更新，请重新提问。')
    if (result.kind === 'data') {
      reviewData = analyzeSellerSpriteReviews(result.data)
    } else {
      reviewData = null
    }
    setReviewsStatus(describeReviewResult(result))
  } finally {
    reviewsLoading = false
    if (loadReviewsButton) loadReviewsButton.disabled = false
  }
}

const askCurrentAnalysis = async (): Promise<void> => {
  const target = current
  if (target === null || analysisLoading) return
  const question = (analysisQuestionInput?.value ?? '').trim()
  if (question.length === 0) {
    setAnalysisStatus('先写下你想了解的问题。', true)
    if (analysisRetryButton) analysisRetryButton.hidden = true
    return
  }

  const targetKey = positionTargetKey(target)
  const requestId = ++analysisRequestId
  analysisLoading = true
  if (analysisAskButton) analysisAskButton.disabled = true
  if (analysisRetryButton) analysisRetryButton.hidden = true
  setAnalysisStatus('正在根据当前已读取的数据分析…')

  try {
    // 记录可能刚刚被同事或当前用户更新，提问时再读一次，避免把旧记录送给模型。
    const recordResult = recordClient === null
      ? null
      : await recordClient.find(target.asin, target.market)
    if (requestId !== analysisRequestId || current === null || positionTargetKey(current) !== targetKey) return
    const evidence = buildAnalysisEvidence({
      object: target,
      keywordRows,
      keywordSummary,
      reviewData,
      record: recordResult?.kind === 'found' ? recordResult.record : null,
    })
    const result = await askAnalysis(question, evidence)
    if (requestId !== analysisRequestId || current === null || positionTargetKey(current) !== targetKey) return
    if (result.kind === 'answer') {
      lastAnalysis = result
      lastAnalysisEvidence = evidence
      lastAnalysisQuestion = question
      renderAnalysisAnswer()
      setAnalysisStatus('已生成回答，引用了 ' + result.response.answer.citations.length + ' 条证据。')
      if (analysisRetryButton) analysisRetryButton.hidden = true
    } else {
      setAnalysisStatus(result.kind === 'unsupported-scope' ? result.message : result.reason, true)
      if (analysisRetryButton) analysisRetryButton.hidden = result.kind !== 'failed'
    }
  } finally {
    if (requestId === analysisRequestId) {
      analysisLoading = false
      if (analysisAskButton) analysisAskButton.disabled = false
    }
  }
}

const renderIdentity = async (): Promise<void> => {
  const nextViewer = await identityStore.read()
  /**
   * 身份变了就等于换了一个人：他看到的记录、能改的东西都不同了。
   * 因此不能只换 token——屏幕上属于上一个身份的研究记录必须立刻消失，
   * 否则新身份会看到（并可能据此判断）别人小组的内容。
   */
  const identityChanged = viewer?.token !== nextViewer?.token
  if (identityChanged) {
    resetAnalysisForTarget()
    clearRecordPanel()
  }
  viewer = nextViewer
  recordClient = viewer === null ? null : new ResearchRecordClient({ token: viewer.token })
  if (viewerElement) viewerElement.textContent = describeViewer(viewer)
  if (identitySection) identitySection.hidden = viewer !== null
  if (clearTokenButton) clearTokenButton.hidden = viewer === null
}

const render = async (): Promise<void> => {
  await renderIdentity()
  current = await objectStore.read()
  const state = describeAnalysisObject(current)
  if (state.kind === 'empty') {
    positionsTarget = null
    keywordRows = []
    keywordSummary = null
    if (emptyElement) emptyElement.hidden = false
    if (objectElement) objectElement.hidden = true
    if (analysisSection) analysisSection.hidden = true
    if (recordSection) recordSection.hidden = true
    if (sourceElement) sourceElement.textContent = ''
    setStatus(null)
    reviewsTarget = null
    reviewData = null
    setReviewsStatus(null)
    renderReviewData(null)
    resetAnalysisForTarget()
    renderSummary(null)
    if (detailsElement) {
      detailsElement.hidden = true
      detailsElement.open = false
    }
    if (tableWrapElement) tableWrapElement.hidden = true
    renderRows([])
    return
  }
  if (emptyElement) emptyElement.hidden = true
  if (objectElement) objectElement.hidden = false
  if (analysisSection) analysisSection.hidden = false
  if (sourceElement) sourceElement.textContent = `${state.asin} · ${state.market} · ${state.sourceLabel}`
  renderFields(state.fields)
  const nextPositionsTarget = state.asin + ':' + state.market
  const shouldLoadPositions = positionsTarget !== nextPositionsTarget
  const shouldResetReviews = reviewsTarget !== nextPositionsTarget
  const shouldResetAnalysis = positionsTarget !== nextPositionsTarget
  if (shouldLoadPositions) {
    // 换了对象就清掉上一个对象的词位，避免把别人的数据留在屏幕上。
    positionsTarget = nextPositionsTarget
    keywordRows = []
    keywordSummary = null
    setStatus(null)
    renderSummary(null)
    if (detailsElement) {
      detailsElement.hidden = true
      detailsElement.open = false
    }
    if (tableWrapElement) tableWrapElement.hidden = true
    renderRows([])
  }
  if (shouldResetReviews) {
    reviewsTarget = nextPositionsTarget
    reviewData = null
    setReviewsStatus(null)
    renderReviewData(null)
  }
  if (shouldResetAnalysis) resetAnalysisForTarget()
  await renderRecord()
  if (shouldLoadPositions) void loadPositions()
}

identityForm?.addEventListener('submit', (event) => {
  event.preventDefault()
  const identity = createViewerIdentity({ token: tokenInput?.value ?? '' })
  if (identity === null) {
    setIdentityError('请填写管理员给你的访问密钥。')
    return
  }
  setIdentityError(null)
  // 换密钥等于换人：旧回答与旧记录都不该继续留在屏幕上。
  resetAnalysisForTarget()
  void identityStore.write(identity).then((ok) => {
    if (!ok) { setIdentityError('无法保存身份，请检查浏览器存储权限。'); return }
    return render()
  })
})

clearTokenButton?.addEventListener('click', () => {
  // 退出会立刻清空面板：清掉密钥后，任何还在屏幕上的研究记录与回答都不再对应一个合法身份。
  resetAnalysisForTarget()
  void identityStore.clear().then((ok) => {
    if (!ok) { setIdentityError('无法清除密钥，请检查浏览器存储权限。'); return }
    if (tokenInput) tokenInput.value = ''
    return render()
  })
})

recordForm?.addEventListener('submit', (event) => {
  event.preventDefault()
  const target = current
  const client = recordClient
  if (target === null || client === null) return
  // 状态只在这里归一：非法值不猜，落到默认的「研究中」。
  // 归属与编辑权由服务端判定：客户端提交什么身份都不算数。
  const raw = recordStatusSelect?.value
  const status: ResearchStatus = isResearchStatus(raw) ? raw : 'researching'
  void (async () => {
    const summary = recordSummaryInput?.value ?? ''
    const result = await client.save({ asin: target.asin, market: target.market, status, summary })
    const failure = describeRecordResult(result)
    if (failure !== null || result.kind !== 'found') {
      setRecordError(failure ?? '无法保存这条记录，请稍后重试。')
      return
    }
    setRecordError(null)
    resetAnalysisForTarget('研究记录已更新，请重新提问。')
    await renderRecord()
  })()
})

loadButton?.addEventListener('click', () => { void loadPositions() })
loadReviewsButton?.addEventListener('click', () => { void loadReviews() })
analysisForm?.addEventListener('submit', (event) => {
  event.preventDefault()
  void askCurrentAnalysis()
})
analysisRetryButton?.addEventListener('click', () => { void askCurrentAnalysis() })

formElement?.addEventListener('submit', (event) => {
  event.preventDefault()
  const created = createAnalysisObject({
    asin: inputElement?.value ?? '',
    market: DEFAULT_MARKET,
    source: 'manual',
    // 归属不由客户端填：身份由服务端按密钥确定，对象本身只记 ASIN 与市场。
    owner: null,
    group: null,
  })
  if (created === null) {
    setError('ASIN 应为 10 位字母或数字，例如 B07Z82895W。')
    return
  }
  setError(null)
  void objectStore.write(created).then((ok) => {
    if (!ok) {
      setError('无法保存到扩展存储，请检查浏览器存储权限后重试。')
      return
    }
    return render()
  })
})

inputElement?.addEventListener('input', () => setError(null))

// 面板同时被两处写入（亚马逊侧选中、本面板手动输入），因此订阅存储变更而不是只在打开时读一次。
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && [ANALYSIS_OBJECT_STORAGE_KEY, VIEWER_IDENTITY_STORAGE_KEY].some((key) => key in changes)) {
    resetAnalysisForTarget()
  }
  if (areaName === 'local' && Object.keys(changes).length > 0) void render()
})

void render()
