import { describeAnalysisObject, type PanelField } from './panel-state'
import type { AnalysisObject } from '../analysis-object'
import type { OverlayMode, OverlayPosition } from './overlay-state'
import { clampOverlayPosition } from './overlay-state'

export const OVERLAY_HOST_ID = 'cookie-amazon-overlay-host'

export type OverlayHandlers = {
  /** 用户点击「固定到侧边栏」。返回是否成功，用于给出反馈。 */
  onPin: () => Promise<boolean>
  /** 用户切换收起 / 展开。 */
  onToggleCollapsed: () => void
  /** 位置变化后持久化。 */
  onMove: (position: OverlayPosition) => void
}

export type OverlayHandle = {
  render: (object: AnalysisObject | null, mode: OverlayMode) => void
  remove: () => void
}

const STYLE = `
:host { all: initial; }
.ca-root { position: fixed; z-index: 2147483646; box-sizing: border-box;
  border: 1px solid #35414a; background: #0b1015; color: #cdd5d4;
  font: 12px/1.5 system-ui, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.45); }
.ca-card { width: 268px; padding: 10px 12px; }
.ca-pill { padding: 4px 9px; cursor: pointer; color: #f2f5f3; font-size: 11px; }
.ca-head { display: flex; align-items: baseline; gap: 8px; }
.ca-card .ca-head { cursor: grab; }
.ca-asin { color: #f2f5f3; font-weight: 600; }
.ca-meta { color: #8b9794; font-size: 10px; margin-left: auto; }
.ca-fields { display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; margin: 8px 0 0; }
.ca-fields dt { color: #8b9794; font-size: 10px; }
.ca-fields dd { margin: 0; color: #f2f5f3; word-break: break-word; }
.ca-actions { display: flex; gap: 6px; margin-top: 10px; }
.ca-actions button { flex: 1; padding: 5px 8px; border: 1px solid #44515a; background: transparent;
  color: #f2f5f3; font: inherit; cursor: pointer; }
.ca-root button:focus-visible, .ca-pill:focus-visible { outline: 2px solid #6ea8a0; outline-offset: 1px; }
`

const element = <K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className !== undefined) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const renderFields = (document: Document, fields: readonly PanelField[]): DocumentFragment => {
  const fragment = document.createDocumentFragment()
  for (const field of fields) {
    fragment.append(element(document, 'dt', undefined, field.label))
    fragment.append(element(document, 'dd', undefined, field.value))
  }
  return fragment
}

/**
 * 把浮层挂到页面上，内容放进 Shadow DOM。
 *
 * 用 Shadow DOM 有两个理由：Amazon 的样式不会漏进来（浮层不会变形），
 * 浮层的样式也不会漏出去（不会影响商品页）。
 *
 * 任何渲染异常都在这里被吞掉并返回 null——AC 要求浮层失败时静默消失，
 * 而它所在的页面必须照常可用。
 */
export const mountOverlay = (
  document: Document,
  handlers: OverlayHandlers,
  initialPosition: OverlayPosition,
): OverlayHandle | null => {
  try {
    const host = element(document, 'div')
    host.id = OVERLAY_HOST_ID
    const shadow = host.attachShadow({ mode: 'open' })
    const style = element(document, 'style')
    style.textContent = STYLE

    const root = element(document, 'div', 'ca-root ca-card')
    const head = element(document, 'div', 'ca-head')
    const asin = element(document, 'span', 'ca-asin')
    const meta = element(document, 'span', 'ca-meta')
    head.append(asin, meta)

    const fields = element(document, 'dl', 'ca-fields')
    const actions = element(document, 'div', 'ca-actions')
    const pin = element(document, 'button', undefined, '固定到侧边栏')
    const collapse = element(document, 'button', undefined, '收起')
    pin.type = 'button'
    collapse.type = 'button'
    actions.append(pin, collapse)

    let position = initialPosition
    const place = (): void => {
      root.style.left = `${position.x}px`
      root.style.top = `${position.y}px`
      root.style.right = 'auto'
      root.style.bottom = 'auto'
    }

    const clampInView = (): void => {
      const rect = root.getBoundingClientRect()
      position = clampOverlayPosition(position, { width: rect.width, height: rect.height }, {
        width: window.innerWidth,
        height: window.innerHeight,
      })
      place()
    }

    pin.addEventListener('click', () => {
      pin.disabled = true
      void handlers.onPin()
        .then((ok) => { pin.textContent = ok ? '已固定' : '请用工具栏图标打开' })
        .catch(() => { pin.textContent = '请用工具栏图标打开' })
        .finally(() => { pin.disabled = false })
    })
    collapse.addEventListener('click', () => handlers.onToggleCollapsed())
    // 药丸形态下点哪里都展开。
    root.addEventListener('click', () => {
      if (root.classList.contains('ca-pill')) handlers.onToggleCollapsed()
    })

    // 拖动只改位置，不做其他副作用；pointerup 时持久化一次。
    head.addEventListener('pointerdown', (event) => {
      if (!root.classList.contains('ca-card')) return
      const startX = event.clientX
      const startY = event.clientY
      const origin = { ...position }
      const move = (moveEvent: PointerEvent): void => {
        position = { x: origin.x + moveEvent.clientX - startX, y: origin.y + moveEvent.clientY - startY }
        place()
      }
      const up = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        clampInView()
        handlers.onMove(position)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    })

    root.append(head, fields, actions)
    shadow.append(style, root)
    place()
    document.documentElement?.append(host)

    return {
      render: (object, mode) => {
        try {
          if (mode === 'hidden' || object === null) { host.style.display = 'none'; return }
          const state = describeAnalysisObject(object)
          if (state.kind === 'empty') { host.style.display = 'none'; return }
          host.style.display = ''
          const isPill = mode === 'pill'
          root.className = isPill ? 'ca-root ca-pill' : 'ca-root ca-card'
          fields.hidden = isPill
          actions.hidden = isPill
          asin.textContent = state.asin
          meta.textContent = isPill ? '' : `${state.market} · ${state.sourceLabel}`
          if (!isPill) fields.replaceChildren(renderFields(document, state.fields))
          clampInView()
        } catch {
          // 单次渲染失败只让浮层保持原样，不影响页面。
        }
      },
      remove: () => { host.remove() },
    }
  } catch {
    return null
  }
}
