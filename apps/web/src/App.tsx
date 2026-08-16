import type { ReactElement } from 'react'
import { useState } from 'react'
import { getExtensionStatus, WebSdkError } from '@cookie-amazon/web-sdk'
import type { ExtensionStatus } from '@cookie-amazon/protocol'

export function App(): ReactElement {
  const [status, setStatus] = useState<ExtensionStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const checkExtension = async (): Promise<void> => {
    setChecking(true)
    setError(null)
    try {
      setStatus(await getExtensionStatus())
    } catch (reason: unknown) {
      setStatus(null)
      setError(reason instanceof WebSdkError ? reason.code : 'EXTENSION_UNAVAILABLE')
    } finally {
      setChecking(false)
    }
  }

  return <main>
    <h1>Cookie Amazon Platform</h1>
    <p>Phase 1 · Web 与浏览器扩展安全通信</p>
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
    {error && <p role="alert">检测失败：{error}</p>}
  </main>
}