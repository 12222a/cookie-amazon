import type { ReactElement } from 'react'
import { useState } from 'react'
import {
  checkLogin,
  getExtensionStatus,
  getProfile,
  listTargets,
  removeTargetPermission,
  requestTargetPermission,
  WebSdkError,
} from '@cookie-amazon/web-sdk'
import type { ExtensionStatus, TargetDescriptor } from '@cookie-amazon/protocol'

export function App(): ReactElement {
  const [status, setStatus] = useState<ExtensionStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [targets, setTargets] = useState<readonly TargetDescriptor[]>([])
  const [targetMessage, setTargetMessage] = useState<string | null>(null)
  const [targetBusy, setTargetBusy] = useState<string | null>(null)

  const checkExtension = async (): Promise<void> => {
    setChecking(true)
    setError(null)
    try {
      setStatus(await getExtensionStatus())
      setTargets(await listTargets())
    } catch (reason: unknown) {
      setStatus(null)
      setTargets([])
      setError(reason instanceof WebSdkError ? reason.code : 'EXTENSION_UNAVAILABLE')
    } finally {
      setChecking(false)
    }
  }

  const runTargetAction = async (
    targetId: string,
    action: () => Promise<string>,
  ): Promise<void> => {
    setTargetBusy(targetId)
    setTargetMessage(null)
    try {
      setTargetMessage(await action())
      setTargets(await listTargets())
    } catch (reason: unknown) {
      setTargetMessage(`操作失败：${reason instanceof WebSdkError ? reason.code : 'EXTENSION_UNAVAILABLE'}`)
    } finally {
      setTargetBusy(null)
    }
  }

  return <main>
    <h1>Cookie Amazon Platform</h1>
    <p>Phase 5 · Profile、Feature Flag 与 Kill Switch</p>
    <button type="button" onClick={() => void checkExtension()} disabled={checking}>
      {checking ? '检测中…' : '检测扩展'}
    </button>
    {status && <section aria-live="polite">
      <strong>已连接</strong>
      <dl>
        <dt>协议版本</dt><dd>{status.protocolVersion}</dd>
        <dt>扩展版本</dt><dd>{status.extensionVersion}</dd>
        <dt>能力</dt><dd>{status.capabilities.join(', ')}</dd>
      </dl>
    </section>}
    {status && <section className="targets" aria-label="Target 冒烟测试">
      <h2>Targets</h2>
      {targets.map((target) => <article key={target.targetId}>
        <div>
          <strong>{target.displayName}</strong>
          <small>{target.targetId} · {target.status}</small>
        </div>
        <div className="actions">
          <button type="button" disabled={targetBusy === target.targetId || target.status === 'ready'} onClick={() => void runTargetAction(
            target.targetId,
            async () => {
              await requestTargetPermission(target.targetId)
              return `${target.displayName} 授权成功`
            },
          )}>授权访问</button>
          <button type="button" disabled={targetBusy === target.targetId || target.status !== 'ready'} onClick={() => void runTargetAction(
            target.targetId,
            async () => {
              const result = await checkLogin(target.targetId, { timeoutMs: 10_000 })
              return `${target.displayName} 登录状态：${result.loggedIn ? '已登录' : '未登录'}`
            },
          )}>检查登录</button>
          <button type="button" disabled={targetBusy === target.targetId || target.status !== 'ready'} onClick={() => void runTargetAction(
            target.targetId,
            async () => {
              const result = await getProfile(target.targetId, { timeoutMs: 12_000 })
              return `${target.displayName} 资料：${result.profile.displayName} (${result.profile.userId})`
            },
          )}>读取资料</button>
          <button type="button" disabled={targetBusy === target.targetId || target.status !== 'ready'} onClick={() => void runTargetAction(
            target.targetId,
            async () => {
              await removeTargetPermission(target.targetId)
              return `${target.displayName} 已取消授权`
            },
          )}>取消授权</button>
        </div>
      </article>)}
      {targetMessage && <p role="status">{targetMessage}</p>}
    </section>}
    {error && <p role="alert">检测失败：{error}</p>}
  </main>
}