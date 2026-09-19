import '../../src/panel/panel.css'
import { AnalysisObjectStore } from '../../src/analysis-object-store'
import { createAnalysisObject, DEFAULT_MARKET, type AnalysisObject } from '../../src/analysis-object'
import { describeAnalysisObject } from '../../src/panel/panel-state'
import { describeColleagueRecord, describeRecordForOwner, RESEARCH_STATUS_LABELS } from '../../src/panel/research-panel-state'
import { type KeywordPositionResult } from '../../src/panel/keyword-positions-client'
import { requestKeywordPositionsCached, type CachedKeywordPositionResult } from '../../src/panel/keyword-position-cache-client'
import { KeywordPositionCache } from '../../src/panel/keyword-position-cache'
import type { KeywordPositionRow } from '../../src/panel/keyword-positions'
import { createResearchRecord, canEditRecord, isResearchStatus, updateResearchRecord, type ResearchRecord, type ResearchStatus } from '../../src/research-record'
import { ResearchRecordStore } from '../../src/research-record-store'
import { createViewerIdentity, describeViewer, ViewerIdentityStore, type ViewerIdentity } from '../../src/viewer-identity'

const objectStore = new AnalysisObjectStore(browser.storage.local)
const recordStore = new ResearchRecordStore(browser.storage.local)
const identityStore = new ViewerIdentityStore(browser.storage.local)
const positionCache = new KeywordPositionCache(browser.storage.local)

const sourceElement = document.querySelector<HTMLParagraphElement>('#source')
const viewerElement = document.querySelector<HTMLParagraphElement>('#viewer')
const identitySection = document.querySelector<HTMLElement>('#identity')
const identityForm = document.querySelector<HTMLFormElement>('#identity-form')
const nameInput = document.querySelector<HTMLInputElement>('#viewer-name')
const groupInput = document.querySelector<HTMLInputElement>('#viewer-group')
const identityError = document.querySelector<HTMLParagraphElement>('#identity-error')
const emptyElement = document.querySelector<HTMLElement>('#empty')
const objectElement = document.querySelector<HTMLElement>('#object')
const fieldsElement = document.querySelector<HTMLDListElement>('#fields')
const formElement = document.querySelector<HTMLFormElement>('#manual')
const inputElement = document.querySelector<HTMLInputElement>('#asin')
const errorElement = document.querySelector<HTMLParagraphElement>('#error')
const loadButton = document.querySelector<HTMLButtonElement>('#load-positions')
const statusElement = document.querySelector<HTMLParagraphElement>('#positions-status')
const tableWrapElement = document.querySelector<HTMLElement>('#positions-table-wrap')
const rowsElement = document.querySelector<HTMLTableSectionElement>('#positions-rows')
const recordSection = document.querySelector<HTMLElement>('#record')
const recordOwnerElement = document.querySelector<HTMLSpanElement>('#record-owner')
const recordNoteElement = document.querySelector<HTMLParagraphElement>('#record-note')
const recordForm = document.querySelector<HTMLFormElement>('#record-form')
const recordSummaryInput = document.querySelector<HTMLTextAreaElement>('#record-summary')
const recordStatusSelect = document.querySelector<HTMLSelectElement>('#record-status')
const recordError = document.querySelector<HTMLParagraphElement>('#record-error')

let current: AnalysisObject | null = null
let viewer: ViewerIdentity | null = null
let loading = false

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

const setStatus = (message: string | null): void => {
  if (!statusElement) return
  statusElement.hidden = message === null
  statusElement.textContent = message ?? ''
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
    return tr
  }))
}

/**
 * 把取数结果翻译成面板上的话。每一种失败都给出下一步该做什么，
 * 而不是把错误码直接甩给用户。
 */
const describeResult = (result: KeywordPositionResult): string | null => {
  if (result.kind === 'rows') {
    if (tableWrapElement) tableWrapElement.hidden = result.rows.length === 0
    renderRows(result.rows)
    return result.rows.length === 0
      ? '这个 ASIN 当前没有可读取的关键词。'
      : `已读取 ${result.rows.length} 个关键词。`
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
  recordSection.hidden = false
  // 只有组内记录可见：组外记录既不该显示，也不该泄漏出「有人研究过」这件事。
  const visible = await recordStore.find(current.asin, viewer?.group ?? null)
  const colleague = describeColleagueRecord(visible)
  if (recordOwnerElement) recordOwnerElement.textContent = colleague.kind === 'colleague' ? colleague.owner : ''
  if (recordNoteElement) {
    recordNoteElement.hidden = false
    recordNoteElement.textContent = colleague.note
  }
  const editable = visible === null || canEditRecord(visible, viewer)
  if (recordForm) recordForm.hidden = !editable || viewer === null
  const state = describeRecordForOwner(visible)
  if (recordSummaryInput && editable) recordSummaryInput.value = state.summary
  if (recordStatusSelect && editable) recordStatusSelect.value = state.status
  setRecordError(null)
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
  loading = true
  if (loadButton) loadButton.disabled = true
  setStatus('正在读取…')
  try {
    const result: CachedKeywordPositionResult = await requestKeywordPositionsCached(
      target.asin, target.market, { cache: positionCache },
    )
    const message = describeResult(result)
    setStatus(result.cached ? `${message}（${describeCacheAge(result.ageMs)}）` : message)
  } finally {
    loading = false
    if (loadButton) loadButton.disabled = false
  }
}

const renderIdentity = async (): Promise<void> => {
  viewer = await identityStore.read()
  if (viewerElement) viewerElement.textContent = describeViewer(viewer)
  if (identitySection) identitySection.hidden = viewer !== null
  if (nameInput && viewer) nameInput.value = viewer.name
  if (groupInput && viewer) groupInput.value = viewer.group
}

const render = async (): Promise<void> => {
  await renderIdentity()
  current = await objectStore.read()
  const state = describeAnalysisObject(current)
  if (state.kind === 'empty') {
    if (emptyElement) emptyElement.hidden = false
    if (objectElement) objectElement.hidden = true
    if (recordSection) recordSection.hidden = true
    if (sourceElement) sourceElement.textContent = ''
    return
  }
  if (emptyElement) emptyElement.hidden = true
  if (objectElement) objectElement.hidden = false
  if (sourceElement) sourceElement.textContent = `${state.asin} · ${state.market} · ${state.sourceLabel}`
  renderFields(state.fields)
  // 换了对象就清掉上一个对象的词位，避免把别人的数据留在屏幕上。
  setStatus(null)
  if (tableWrapElement) tableWrapElement.hidden = true
  renderRows([])
  await renderRecord()
}

identityForm?.addEventListener('submit', (event) => {
  event.preventDefault()
  const identity = createViewerIdentity({ name: nameInput?.value ?? '', group: groupInput?.value ?? '' })
  if (identity === null) {
    setIdentityError('名字和小组都要填，研究记录才能归属到人。')
    return
  }
  setIdentityError(null)
  void identityStore.write(identity).then((ok) => {
    if (!ok) { setIdentityError('无法保存身份，请检查浏览器存储权限。'); return }
    return render()
  })
})

recordForm?.addEventListener('submit', (event) => {
  event.preventDefault()
  const target = current
  const self = viewer
  if (target === null || self === null) return
  // 状态只在这里归一：非法值不猜，落到默认的「研究中」。
  // 真正能否写下去由 updateResearchRecord / createResearchRecord 判定。
  const raw = recordStatusSelect?.value
  const status: ResearchStatus = isResearchStatus(raw) ? raw : 'researching'
  void (async () => {
    const existing = await recordStore.find(target.asin, self.group)
    // 编辑权在提交路径上再复核一次：界面隐藏表单是提示，不是许可。
    if (existing !== null && !canEditRecord(existing, self)) {
      setRecordError('这条记录由 ' + existing.owner + ' 维护，只有作者本人能改。')
      return
    }
    const summary = recordSummaryInput?.value ?? ''
    const next: ResearchRecord | null = existing === null
      ? createResearchRecord({
          asin: target.asin, market: target.market,
          owner: self.name, group: self.group, summary, status,
        })
      : updateResearchRecord(existing, { summary, status })
    if (next === null) { setRecordError('无法保存这条记录，请检查填写内容。'); return }
    if (!(await recordStore.save(next))) { setRecordError('无法保存到扩展存储，请稍后重试。'); return }
    setRecordError(null)
    await renderRecord()
  })()
})

loadButton?.addEventListener('click', () => { void loadPositions() })

formElement?.addEventListener('submit', (event) => {
  event.preventDefault()
  const created = createAnalysisObject({
    asin: inputElement?.value ?? '',
    market: DEFAULT_MARKET,
    source: 'manual',
    owner: viewer?.name ?? null,
    group: viewer?.group ?? null,
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
  if (areaName === 'local' && Object.keys(changes).length > 0) void render()
})

void render()
