import type { AnalysisViewType } from '@cookie-amazon/protocol'
import type { AnalysisObject } from '../analysis-object'
import { describeAnalysisObject } from './panel-state'
import type { OverlayMode, OverlayPosition } from './overlay-state'
import { clampOverlayPosition } from './overlay-state'
import { renderConversationThread } from './conversation-view'
import { renderDrawerPartitions, revealDrawerPartition } from './analysis-view'
import { buildAnalysisEvidence } from './analysis-evidence'
import { sameAnalysisTarget, type PublishedConversation } from './conversation-store'
// 浮层在 shadow DOM 里，拿不到侧边栏那份外部样式，所以这里读同一份 CSS 文本再内联进去。
// shell-style.css 是两套外壳共用的配色、字号与间距；overlay.css 只是浮层自己的布局。
import shellStyle from './shell-style.css?raw'
import overlayStyle from './overlay.css?raw'

export const OVERLAY_HOST_ID = 'cookie-amazon-overlay-host'

export type OverlayHandlers = {
  /** 用户点击「固定到侧边栏」。返回是否成功，用于给出反馈。 */
  onPin: () => Promise<boolean>
  /** 用户切换收起 / 展开。 */
  onToggleCollapsed: () => void
  /** 位置变化后持久化。 */
  onMove: (position: OverlayPosition) => void
  /**
   * 读取侧边栏发布的对话快照——同一个分析对象、同一条对话串、同一份证据包。
   *
   * 浮层不自己提问也不自己取数：提问的端点只允许扩展自己的源，而这里跑在 amazon.com 上，
   * 页面上就地再问一次只会得到第二条与侧边栏不同的对话（#22 要消掉的正是这个）。
   */
  readConversation: () => PublishedConversation | null
}

export type OverlayHandle = {
  render: (object: AnalysisObject | null, mode: OverlayMode) => void
  remove: () => void
}

const STYLE = shellStyle + overlayStyle

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

/** 快照属于当前对象才显示：上一个对象的对话留在页面上，比没有对话更糟。 */
const conversationOf = (
  snapshot: PublishedConversation | null,
  object: AnalysisObject,
): PublishedConversation | null =>
  snapshot !== null && sameAnalysisTarget(snapshot, object) ? snapshot : null

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

    // 对话串与抽屉都用共享来源里的类名：渲染的是同一批节点，样式也只该有一份。
    const thread = element(document, 'div', 'panel-thread')
    // 数据抽屉：与侧边栏同样默认收起，展开状态只活在这次对话里。
    const drawer = element(document, 'section', 'panel-drawer')
    const drawerToggle = element(document, 'button', 'panel-drawer-toggle', '数据抽屉')
    drawerToggle.type = 'button'
    drawerToggle.setAttribute('aria-expanded', 'false')
    const drawerViews = element(document, 'div', 'panel-drawer-views')
    drawerViews.hidden = true
    drawer.append(drawerToggle, drawerViews)
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

    /**
     * 抽屉的开合只有这一个来源：内容与 aria 状态都由它落下去。
     * 三处各写一遍 hidden 与 aria-expanded，迟早有一处忘记跟上——那正是「收起收不起来」的来源。
     */
    let open = false
    const setDrawerOpen = (next: boolean): void => {
      open = next
      drawerViews.hidden = !next
      drawerToggle.setAttribute('aria-expanded', next ? 'true' : 'false')
    }
    drawerToggle.addEventListener('click', () => { setDrawerOpen(!open) })

    /**
     * 气泡里的内嵌视图入口：展开抽屉并把对应分区带到眼前。
     *
     * 展开与定位都走与侧边栏同一条路（revealDrawerPartition）：分区身份就是视图类型，
     * 两侧的分区都由 renderDrawerPartitions 产出，所以不存在第二套对应表。
     */
    const openDrawerAt = (view: AnalysisViewType): void => {
      setDrawerOpen(true)
      revealDrawerPartition(drawerViews, view)
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

    root.append(head, thread, drawer, actions)
    shadow.append(style, root)
    place()
    document.documentElement?.append(host)

    return {
      // 这里不吞异常：渲染失败要能被控制器看见，由它决定移除浮层（AC：静默消失），
      // 否则失败会留下一份与当前对象不符的旧内容。
      render: (object, mode) => {
        if (mode === 'hidden' || object === null) {
          host.style.display = 'none'
          return
        }
        host.style.display = ''
        const isPill = mode === 'pill'
        root.className = isPill ? 'ca-root ca-pill' : 'ca-root ca-card'
        thread.hidden = isPill
        drawer.hidden = isPill
        actions.hidden = isPill
        // 站点与来源仍是用户判断「我现在看的是哪来的对象」的依据，收起时才让位给药丸。
        const header = describeAnalysisObject(object)
        asin.textContent = header.kind === 'ready' ? header.asin : object.asin
        meta.textContent = isPill || header.kind !== 'ready' ? '' : header.market + ' · ' + header.sourceLabel
        // 收起态就是一颗药丸：对话串不留在 DOM 里，展开时再按当时的数据重建一遍。
        if (isPill) {
          thread.replaceChildren()
          drawerViews.replaceChildren()
          // 展开状态也不跨收起保留：药丸上那点位置藏不住一个展开的抽屉，
          // 再展开时回到默认收起，与侧边栏「抽屉默认收起」的语义一致。
          setDrawerOpen(false)
        } else {
          /**
           * 读发布的那一份要兜住异常：它来自扩展存储，浮层所在的页面必须照常可用。
           * 读不到就只有对象本身可看，一条气泡也不编。
           */
          let snapshot: PublishedConversation | null = null
          try { snapshot = conversationOf(handlers.readConversation(), object) } catch { snapshot = null }
          renderConversationThread(document, thread, snapshot?.turns ?? [], openDrawerAt)
          /**
           * 抽屉与对话共用同一份证据包。侧边栏还没发布过（用户从没打开过它）时，
           * 用同一个 buildAnalysisEvidence 就当前对象现建一份——同一个纯函数、同一个对象，
           * 得到的还是抽屉里那个前台信息分区，不会多出第二套数字。
           */
          renderDrawerPartitions(
            document,
            drawerViews,
            snapshot?.evidence ?? buildAnalysisEvidence({ object }),
            // 浮层不写研究记录，所以把那一格也要回来：两处的抽屉显示同一批分区。
            { includeRecord: true },
          )
        }
        clampInView()
      },
      remove: () => { host.remove() },
    }
  } catch {
    return null
  }
}
