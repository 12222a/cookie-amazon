import '../../src/panel/panel.css'
import { AnalysisObjectStore } from '../../src/analysis-object-store'
import { createAnalysisObject, DEFAULT_MARKET, type AnalysisObject } from '../../src/analysis-object'
import { describeAnalysisObject } from '../../src/panel/panel-state'
import { requestKeywordPositions, type KeywordPositionResult } from '../../src/panel/keyword-positions-client'
import type { KeywordPositionRow } from '../../src/panel/keyword-positions'

const objectStore = new AnalysisObjectStore(browser.storage.local)

const sourceElement = document.querySelector<HTMLParagraphElement>('#source')
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

let current: AnalysisObject | null = null
let loading = false

const setError = (message: string | null): void => {
  if (!errorElement) return
  errorElement.hidden = message === null
  errorElement.textContent = message ?? ''
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

const loadPositions = async (): Promise<void> => {
  if (current === null || loading) return
  loading = true
  if (loadButton) loadButton.disabled = true
  setStatus('正在读取…')
  try {
    setStatus(describeResult(await requestKeywordPositions(current.asin, current.market)))
  } finally {
    loading = false
    if (loadButton) loadButton.disabled = false
  }
}

const render = async (): Promise<void> => {
  current = await objectStore.read()
  const state = describeAnalysisObject(current)
  if (state.kind === 'empty') {
    if (emptyElement) emptyElement.hidden = false
    if (objectElement) objectElement.hidden = true
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
}

loadButton?.addEventListener('click', () => { void loadPositions() })

formElement?.addEventListener('submit', (event) => {
  event.preventDefault()
  const created = createAnalysisObject({ asin: inputElement?.value ?? '', market: DEFAULT_MARKET, source: 'manual' })
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
