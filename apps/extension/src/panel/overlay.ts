import type { AnalysisAskSuccess, AnalysisEvidence, AnalysisHistoryTurn, AnalysisViewType } from '@cookie-amazon/protocol'
import type { AnalysisObject } from '../analysis-object'
import { describeAnalysisObject } from './panel-state'
import type { OverlayMode, OverlayPosition } from './overlay-state'
import { clampOverlayPosition } from './overlay-state'
import { conversationHistory, renderConversationThread, withAnswer, withQuestion } from './conversation-view'
import { renderDrawerPartitions, revealDrawerPartition } from './analysis-view'
import { buildAnalysisEvidence } from './analysis-evidence'
import { sameAnalysisTarget, type PublishedConversation } from './conversation-store'
import type { AnalysisResult } from './analysis-client'
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
   */
  readConversation: () => PublishedConversation | null
  /**
   * 就地提问（#24）。端点没有 CORS 头，页面侧直连会被同源策略挡掉，所以这一条经
   * background 中转（analysis-ask-relay）；这里拿到的仍是侧边栏用的那一种结果。
   *
   * 这一对是可选的整体：不传就只有读的那一半（#22 的浮层），此时提问那一行不出现——
   * 显示一个按下去没有反应的输入框，比没有输入框更让人以为「这里能问」。
   */
  askAnalysis?: (
    question: string,
    evidence: AnalysisEvidence,
    history: readonly AnalysisHistoryTurn[],
  ) => Promise<AnalysisResult>
  /**
   * 把这一轮写回共有的那条对话串。
   *
   * 浮层问出来的那一轮必须落在这里，否则页面上就有第二条只有本页看得见的对话——
   * 正是 #22 与这张票要消掉的东西。写不进去时不问，也不装作问过。
   */
  publishConversation?: (value: PublishedConversation) => Promise<boolean>
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

    /**
     * 就地提问的一行：输入框 + 提交 + 状态。
     *
     * 没有提问通道时这一行整个不出现（见 render）：显示一个按下去没有反应的输入框，
     * 比没有输入框更让人以为「这里能问」。
     */
    const ask = element(document, 'form', 'ca-ask')
    const askInput = element(document, 'input', 'ca-ask-input')
    const askSubmit = element(document, 'button', 'ca-ask-submit', '提问')
    const askStatus = element(document, 'p', 'ca-ask-status')
    askInput.type = 'text'
    askInput.maxLength = 1000
    askInput.placeholder = '就当前对象提一个问题'
    askSubmit.type = 'submit'
    askStatus.hidden = true
    ask.append(askInput, askSubmit, askStatus)

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

    /**
     * 快照属于当前对象才拿它提问：上一个对象的证据包进到这一轮里，
     * 就是屏幕上两个不同的东西（conversationOf 同一个判断）。
     */
    const snapshotFor = (target: AnalysisObject): PublishedConversation | null => {
      try {
        return conversationOf(handlers.readConversation(), target)
      } catch {
        // 读存储失败是信任边界上的事：没有快照就没有对话，浮层照常显示对象本身。
        return null
      }
    }

    /**
     * 状态行的语气与侧边栏同一条约定：失败说成失败，不混在普通提示里
     * （侧边栏是 data-kind='error'，样式在共享来源里）。
     */
    const setAskStatus = (message: string | null, error = false): void => {
      askStatus.hidden = message === null
      askStatus.textContent = message ?? ''
      askStatus.dataset.kind = error ? 'error' : 'info'
    }

    /** 已经问出去、还在路上的那一轮：进行中不许再问，且按钮要跟着禁用。 */
    let asking = false
    /** 最近一次渲染的是哪个对象、哪种形态：浮层自己的重画要照着它来。 */
    let shownObject: AnalysisObject | null = null
    let shownMode: OverlayMode = 'hidden'

    /**
     * 就地提问（#24）。
     *
     * 顺序是有意的：先把这一轮写进共有的那条对话串，再问。写不进去就不问——
     * 问出来的回答只有这一页看得到，正是「两处显示不同的东西」的起点，
     * 也正是 #22 与这张票要消掉的东西。
     */
    const askQuestion = async (): Promise<void> => {
      const { askAnalysis, publishConversation: publish } = handlers
      const target = shownObject
      if (askAnalysis === undefined || publish === undefined || asking || target === null) return
      const question = askInput.value.trim()
      if (question.length === 0) {
        setAskStatus('先写下你想了解的问题。', true)
        return
      }

      const snapshot = snapshotFor(target)
      // 证据包来自浮层读到的快照，不自己另取一份：两壳引用的是同一个数。
      const evidence = snapshot?.evidence ?? buildAnalysisEvidence({ object: target })
      const base = snapshot?.turns ?? []
      if (!await publish({ asin: target.asin, market: target.market, evidence, turns: withQuestion(base, question) })) {
        setAskStatus('没能记下这一轮，先别问：这样问出来的回答只有这一页看得到。', true)
        return
      }

      asking = true
      askSubmit.disabled = true
      /**
       * 输入框也一起禁掉：提问在路上的时候用户可能接着打下一条，
       * 而那一条会被下面清空输入框那一步连同这句话一起丢掉。
       */
      askInput.disabled = true
      setAskStatus('正在根据当前已读取的数据分析…')
      paint()
      try {
        const result = await askAnalysis(question, evidence, conversationHistory(base))
        // 请求在路上的时候用户可能换了对象：那一轮属于上一个对象，不能落到这个对象的对话串上。
        if (shownObject === null || !sameAnalysisTarget(shownObject, target)) return
        if (result.kind !== 'answer') {
          /**
           * 越界与失败都沿用既有语义：越界说的是端点给的文案，失败说的是既有失败原因。
           * 那一轮留在对话串里等着重问——重问同一句就是这一轮，不会再添一个气泡。
           */
          setAskStatus(result.kind === 'unsupported-scope' ? result.message : result.reason, true)
          return
        }
        const answer = result.response
        if (!await publishAnswer(target, question, answer, evidence)) {
          setAskStatus('回答没能写进共有的那条对话，所以这里不显示它——重问一次即可。', true)
          return
        }
        setAskStatus('已生成回答，引用了 ' + answer.answer.citations.length + ' 条证据。')
        paint()
      } catch {
        // 通道异常不能让浮层所在的页面跟着出事：说清楚没拿到回答就够了。
        setAskStatus('没能拿到回答，请稍后重试。', true)
      } finally {
        asking = false
        askSubmit.disabled = false
        askInput.disabled = false
        // 用户打下的那句话到这里才算交出去：写进去的那条就是屏幕上该有的那条。
        askInput.value = ''
      }
    }

    /**
     * 把回答补回同一轮上，并发布出去。
     *
     * 先重读一次快照，而不是照着提问时那一份改写：请求在路上时另一处可能又问了一轮，
     * 照旧值整份覆盖会把那一轮抹掉。找的是「我刚问的那句、还没回答」的那一轮，
     * 因此两处各问各的也能各回各的。
     */
    const publishAnswer = async (
      target: AnalysisObject,
      question: string,
      response: AnalysisAskSuccess,
      fallbackEvidence: AnalysisEvidence,
    ): Promise<boolean> => {
      const publish = handlers.publishConversation
      if (publish === undefined) return false
      const latest = snapshotFor(target)
      const turns = latest?.turns ?? []
      const evidence = latest?.evidence ?? fallbackEvidence
      return publish({
        asin: target.asin,
        market: target.market,
        evidence,
        turns: withAnswer(turns, question, { response, evidence }),
      })
    }

    ask.addEventListener('submit', (event) => {
      event.preventDefault()
      void askQuestion()
    })
    root.append(head, thread, ask, drawer, actions)
    shadow.append(style, root)
    place()
    document.documentElement?.append(host)

    /**
     * 按「最近一次渲染的对象与形态」重画一遍。
     *
     * 提问那条路径要主动重画（问句先出现、回答再补上），而它拿到的不是 render 的参数，
     * 所以这里记着最近一次渲染的是什么——浮层自己的状态变更也照着同一份数据画。
     */
    const paint = (): void => {
      const object = shownObject
      if (object === null || shownMode === 'hidden') return
      const isPill = shownMode === 'pill'
      const canAsk = handlers.askAnalysis !== undefined && handlers.publishConversation !== undefined
      ask.hidden = isPill || !canAsk
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
        const snapshot = snapshotFor(object)
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
    }

    return {
      // 这里不吞异常：渲染失败要能被控制器看见，由它决定移除浮层（AC：静默消失），
      // 否则失败会留下一份与当前对象不符的旧内容。
      render: (object, mode) => {
        shownObject = object
        shownMode = mode
        if (mode === 'hidden' || object === null) {
          host.style.display = 'none'
          return
        }
        host.style.display = ''
        root.className = mode === 'pill' ? 'ca-root ca-pill' : 'ca-root ca-card'
        const isPill = mode === 'pill'
        thread.hidden = isPill
        drawer.hidden = isPill
        actions.hidden = isPill
        paint()
      },
      remove: () => { host.remove() },
    }
  } catch {
    return null
  }
}
