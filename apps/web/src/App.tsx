import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  checkLogin,
  getExtensionStatus,
  listTargets,
  probeContentScript,
  WebSdkError,
} from '@cookie-amazon/web-sdk'
import type { ExtensionStatus, TargetDescriptor } from '@cookie-amazon/protocol'
import { ProductResearchWorkbench } from './product-research/ProductResearchWorkbench'
import { hasAbaCapabilities } from './product-research/aba-search'

export function App(): ReactElement {
  const [status, setStatus] = useState<ExtensionStatus | null>(null)
  const [targets, setTargets] = useState<readonly TargetDescriptor[]>([])
  const [checking, setChecking] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [loginVerified, setLoginVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const checkExtension = async (): Promise<void> => {
    setChecking(true)
    setError(null)
    try {
      const extensionStatus = await getExtensionStatus({ timeoutMs: 3_000 })
      setStatus(extensionStatus)

      try {
        setTargets(await listTargets({ timeoutMs: 5_000 }))
      } catch (reason: unknown) {
        const code = reason instanceof WebSdkError ? reason.code : 'EXTENSION_UNAVAILABLE'
        setError(code)
        setMessage('扩展已连接，但目标状态读取超时。已保留现有连接状态，请稍后重试。')
      }
    } catch (reason: unknown) {
      const code = reason instanceof WebSdkError ? reason.code : 'EXTENSION_UNAVAILABLE'
      const contentProbe = await probeContentScript({ timeoutMs: 750 })
      setMessage(contentProbe.available
        ? '已检测到扩展内容脚本，但网页桥接响应超时。已保留现有连接状态，请重新检测。'
        : '扩展内容脚本未注入当前页面。请在扩展管理页确认扩展已启用并重新加载，然后重新打开此页面。')
      if (!contentProbe.available) {
        setStatus(null)
        setTargets([])
        setLoginVerified(false)
      }
      setError(code)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => { void checkExtension() }, [])

  const sellersprite = useMemo(() => targets.find((target) => target.targetId === 'sellersprite'), [targets])
  const targetReady = loginVerified && sellersprite?.status === 'ready'
  const abaSupported = hasAbaCapabilities(status?.capabilities)

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
        setMessage('扩展已连接，但 SellerSprite 尚未授权。请点击浏览器工具栏中的 Cookie Amazon Platform 扩展，再点击“授权 SellerSprite”。')
        return
      }

      const login = await checkLogin('sellersprite', { timeoutMs: 20_000 })
      setLoginVerified(login.loggedIn)
      const connectionMessage = login.connectionState === 'NO_COOKIE'
        ? '未发现 SellerSprite Cookie，已打开 SellerSprite，请登录后再次点击连接。'
        : login.connectionState === 'BACKGROUND_OK'
          ? 'SellerSprite 已登录，后台模式可用。'
          : login.connectionState === 'PAGE_CONTEXT_OK'
            ? 'SellerSprite 已登录，页面模式可用。'
            : login.connectionState === 'PAGE_CONTEXT_FAILED'
              ? '接口失败，请重新登录或检查 SellerSprite 权限。'
              : login.loggedIn
                ? 'SellerSprite 已登录，可以开始实时扫描。'
                : 'SellerSprite 尚未登录，请先打开 SellerSprite 完成登录。'
      setMessage(connectionMessage)
    } catch (reason: unknown) {
      const code = reason instanceof WebSdkError ? reason.code : 'EXTENSION_UNAVAILABLE'
      const contentProbe = await probeContentScript({ timeoutMs: 750 })
      if (!contentProbe.available || !targetReady) setLoginVerified(false)
      setMessage(code === 'TIMEOUT' || code === 'EXTENSION_UNAVAILABLE'
        ? contentProbe.available
          ? targetReady
            ? '扩展响应暂时超时，已保留当前 SellerSprite 实时连接状态。'
            : '扩展内容脚本已注入，但网页桥接响应超时。请重新加载扩展并刷新页面。'
          : '扩展内容脚本未注入当前页面。请重新加载扩展后重新打开此页面。'
        : `连接失败：${code}`)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <div className="app-brand"><span className="app-logo">CA</span><span>Cookie Amazon <small>RESEARCH OS</small></span></div>
        <nav aria-label="主导航"><a className="is-active" href="#research">选品研究</a><a href="#history">历史快照</a><a href="#settings">连接设置</a></nav>
        <div className="app-top-actions"><span className={`app-status ${targetReady ? 'is-live' : ''}`}><i />{targetReady ? 'LIVE' : 'DEMO'}</span><button type="button" className="app-icon-button" aria-label="检测浏览器扩展" onClick={() => void checkExtension()} disabled={checking}>{checking ? '…' : '⟳'}</button></div>
      </header>

      <div className="app-page-intro" id="research"><div><span className="app-breadcrumb">WORKSPACE / PRODUCT RESEARCH</span><h1>亚马逊选品研究台</h1></div><div className="app-date">AUG 18, 2026 <span>·</span> v0.1 MVP</div></div>

      <ProductResearchWorkbench
        targetId="sellersprite"
        targetReady={Boolean(targetReady)}
        abaSupported={abaSupported}
        extensionVersion={status?.extensionVersion}
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
    </main>
  )
}