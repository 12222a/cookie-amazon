import '../../src/panel/panel.css'
import { AnalysisObjectStore } from '../../src/analysis-object-store'
import { createAnalysisObject, DEFAULT_MARKET } from '../../src/analysis-object'
import { describeAnalysisObject } from '../../src/panel/panel-state'

const objectStore = new AnalysisObjectStore(browser.storage.local)

const sourceElement = document.querySelector<HTMLParagraphElement>('#source')
const emptyElement = document.querySelector<HTMLElement>('#empty')
const objectElement = document.querySelector<HTMLElement>('#object')
const fieldsElement = document.querySelector<HTMLDListElement>('#fields')
const formElement = document.querySelector<HTMLFormElement>('#manual')
const inputElement = document.querySelector<HTMLInputElement>('#asin')
const errorElement = document.querySelector<HTMLParagraphElement>('#error')

const setError = (message: string | null): void => {
  if (!errorElement) return
  errorElement.hidden = message === null
  errorElement.textContent = message ?? ''
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

const render = async (): Promise<void> => {
  const state = describeAnalysisObject(await objectStore.read())
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
}

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
