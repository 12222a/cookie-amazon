import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  checkLogin,
  getExtensionStatus,
  listTargets,
  probeContentScript,
  WebSdkError,
} from '@cookie-amazon/web-sdk'
import type { ExtensionStatus, TargetDescriptor, TargetLoginData } from '@cookie-amazon/protocol'
import { ProductResearchWorkbench } from './product-research/ProductResearchWorkbench'
import { FashionDesignWorkspace } from './fashion-design/FashionDesignWorkspace'
import { startSellerSpriteSessionMonitor } from './sellersprite-session-monitor'

const expiredSessionMessage = 'SellerSprite 登录已失效，账号可能已在其他设备登录，请重新登录 SellerSprite 后重试。'

const loginStatusMessage = (login: TargetLoginData): string => {
  if (login.loggedIn) {
    return login.connectionState === 'BACKGROUND_OK'
      ? 'SellerSprite 已登录，后台模式可用。'
      : login.connectionState === 'PAGE_CONTEXT_OK'
        ? 'SellerSprite 已登录，页面模式可用。'
        : 'SellerSprite 已登录，可以开始实时扫描。'
  }
  return login.connectionState === 'NEED_LOGIN'
    ? expiredSessionMessage
    : login.connectionState === 'PAGE_CONTEXT_FAILED'
      ? '无法确认 SellerSprite 登录状态，请检查网络后点击“检查登录”重试。'
      : 'SellerSprite 尚未登录，请先打开 SellerSprite 完成登录。'
}

export function App(): ReactElement {
  const [status, setStatus] = useState<ExtensionStatus | null>(null)
  const [targets, setTargets] = useState<readonly TargetDescriptor[]>([])
  const [checking, setChecking] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [loginVerified, setLoginVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [currentSection, setCurrentSection] = useState<'research' | 'fashion-design'>(() =>
    typeof window !== 'undefined' && window.location.hash === '#fashion-design' ? 'fashion-design' : 'research',
  )
  const connectionCheckInFlight = useRef(false)

  const checkExtension = useCallback(async (): Promise<void> => {
    if (connectionCheckInFlight.current) return
    connectionCheckInFlight.current = true
    setChecking(true)
    setError(null)
    try {
      const extensionStatus = await getExtensionStatus({ timeoutMs: 3_000 })
      setStatus(extensionStatus)

      try {
        const currentTargets = await listTargets({ timeoutMs: 5_000 })
        setTargets(currentTargets)
        const target = currentTargets.find((item) => item.targetId === 'sellersprite')
        if (target?.status === 'ready') {
          try {
            const login = await checkLogin('sellersprite', { timeoutMs: 20_000 })
            setLoginVerified(login.loggedIn)
            setMessage(loginStatusMessage(login))
          } catch (reason: unknown) {
            setLoginVerified(false)
            setMessage(reason instanceof WebSdkError && reason.code === 'TARGET_NOT_LOGGED_IN'
              ? expiredSessionMessage
              : '已检测到扩展授权，但暂时无法确认 SellerSprite 登录状态。请检查网络后点击“检查登录”重试。')
          }
        } else {
          setLoginVerified(false)
          setMessage(target?.status === 'permission-required'
            ? '扩展已连接，但 SellerSprite 尚未授权。请点击浏览器工具栏中的“跨境选品助手”，再点击“授权 SellerSprite”。'
            : 'SellerSprite 目标当前不可用，请检查扩展状态。')
        }
      } catch (reason: unknown) {
        const code = reason instanceof WebSdkError ? reason.code : 'EXTENSION_UNAVAILABLE'
        setTargets([])
        setLoginVerified(false)
        setError(code)
        setMessage('扩展已响应，但目标状态读取失败；当前连接已标记为离线，请重新检测。')
      }
    } catch (reason: unknown) {
      const code = reason instanceof WebSdkError ? reason.code : 'EXTENSION_UNAVAILABLE'
      const contentProbe = await probeContentScript({ timeoutMs: 3_000 })
      setStatus(null)
      setTargets([])
      setLoginVerified(false)
      setMessage(contentProbe.available
        ? '已检测到当前扩展内容脚本，但后台桥接没有响应；当前连接已标记为离线，请重新加载扩展并刷新页面。'
        : '当前页面没有可用的扩展内容脚本。请在扩展管理页重新加载扩展，然后刷新此页面。')
      setError(code)
    } finally {
      connectionCheckInFlight.current = false
      setChecking(false)
    }
  }, [])

  useEffect(() => startSellerSpriteSessionMonitor({
    recheck: () => { void checkExtension() },
    onExpired: () => {
      setLoginVerified(false)
      setError(null)
      setMessage(expiredSessionMessage)
    },
  }), [checkExtension])

  const sellersprite = useMemo(() => targets.find((target) => target.targetId === 'sellersprite'), [targets])
  const targetReady = loginVerified && sellersprite?.status === 'ready'

  const connectTarget = async (): Promise<void> => {
    setConnecting(true)
    setError(null)
    setMessage('正在检测浏览器扩展…')
    setLoginVerified(false)
    try {
      const extensionStatus = await getExtensionStatus({ timeoutMs: 3_000 })
      setStatus(extensionStatus)
      const currentTargets = await listTargets({ timeoutMs: 5_000 })
      setTargets(currentTargets)
      const target = currentTargets.find((item) => item.targetId === 'sellersprite')
      if (!target) throw new WebSdkError('UNKNOWN_TARGET')

      if (target.status === 'permission-required') {
        setLoginVerified(false)
        setMessage('扩展已连接，但 SellerSprite 尚未授权。请点击浏览器工具栏中的“跨境选品助手”，再点击“授权 SellerSprite”。')
        return
      }

      const login = await checkLogin('sellersprite', { timeoutMs: 20_000 })
      setLoginVerified(login.loggedIn)
      setMessage(loginStatusMessage(login))
    } catch (reason: unknown) {
      const code = reason instanceof WebSdkError ? reason.code : 'EXTENSION_UNAVAILABLE'
      setLoginVerified(false)
      if (code === 'TARGET_NOT_LOGGED_IN') {
        setMessage(expiredSessionMessage)
      } else if (code === 'TARGET_PERMISSION_MISSING' || code === 'PERMISSION_REQUEST_DENIED') {
        setMessage('扩展已连接，但 SellerSprite 权限未授权。请在扩展弹窗中完成授权后重试。')
      } else if (code === 'TIMEOUT' || code === 'EXTENSION_UNAVAILABLE') {
        const contentProbe = await probeContentScript({ timeoutMs: 3_000 })
        setStatus(null)
        setTargets([])
        setMessage(contentProbe.available
          ? '当前扩展内容脚本存在，但后台桥接没有响应；连接已标记为离线。请重新加载扩展并刷新页面。'
          : '当前页面没有可用的扩展内容脚本。请重新加载扩展后刷新此页面。')
      } else {
        setMessage(`SellerSprite 接口检查失败：${code}。请稍后重试；若持续失败，请检查网络和 SellerSprite 服务状态。`)
      }
    } finally {
      setConnecting(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <div className="app-brand"><span className="app-logo">CA</span><span>Cookie Amazon <small>RESEARCH CONSOLE</small></span></div>
        <nav aria-label="主导航"><a className={currentSection === 'research' ? 'is-active' : ''} href="#research" onClick={() => setCurrentSection('research')}>产品研究</a><a className={currentSection === 'fashion-design' ? 'is-active' : ''} href="#fashion-design" onClick={() => setCurrentSection('fashion-design')}>AI 服饰设计</a><a href="#evidence">研究证据</a><a href="#settings">数据连接</a></nav>
        <div className="app-top-actions"><span className={`app-status ${targetReady ? 'is-live' : ''}`}><i />{targetReady ? 'SELLERSPRITE · LIVE' : 'SELLERSPRITE · OFFLINE'}</span></div>
      </header>

      {currentSection === 'research' ? <>
      <div className="app-page-intro" id="research"><div><span className="app-breadcrumb">WORKSPACE / PRODUCT RESEARCH / CATEGORY ASIN</span><h1>ASIN 候选研究</h1></div><div className="app-date"><b>SELLERSPRITE · REAL DATA</b><span>·</span>真实数据研究</div></div>
      <div className="app-research-banner" role="note"><b>本轮研究</b><strong>本页只给本轮发现的具体 ASIN 分配研究优先级，不对整个类目下结论。</strong><span>当前结果是研究时间点的商品快照；后续新品需要重新运行研究发现，不会被本次结果否定。</span></div>

      <ProductResearchWorkbench
        targetReady={Boolean(targetReady)}
        onConnect={() => void connectTarget()}
        connectionMessage={message}
        connecting={connecting}
      />

      <details className="connection-panel" id="settings">
        <summary><span><i className={targetReady ? 'summary-live' : ''} />连接状态与权限</span><small>{status ? `扩展 v${status.extensionVersion}` : '未检测到扩展'}</small></summary>
        <div className="connection-body">
          <div><strong>{sellersprite?.displayName ?? 'SellerSprite'}</strong><span>{sellersprite?.origin ?? 'https://www.sellersprite.com'}</span></div>
          <span className={`connection-state state-${sellersprite?.status ?? 'unknown'}`}>{sellersprite?.status === 'ready' ? '已授权' : sellersprite?.status === 'permission-required' ? '需要授权' : '未连接'}</span>
          <button type="button" onClick={() => void connectTarget()} disabled={checking}>{targetReady ? '检查登录' : '连接 / 授权'}</button>
          {message ? <p role="status">{message}</p> : null}
          {error ? <p className="connection-error" role="alert">{error === 'EXTENSION_UNAVAILABLE' ? '浏览器扩展未连接，无法执行 SellerSprite 实时扫描。' : `扩展状态：${error}`}</p> : null}
        </div>
      </details>
      </> : <FashionDesignWorkspace />}
    </main>
  )
}