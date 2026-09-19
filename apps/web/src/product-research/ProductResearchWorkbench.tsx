import type { ReactElement } from 'react'
import { useState } from 'react'
import { AutoResearchPanel } from './auto-research/AutoResearchPanel'
import { KeywordOpportunityPanel } from './KeywordOpportunityPanel'

export function ProductResearchWorkbench({
  targetReady = false,
  onConnect,
  connectionMessage,
  connecting = false,
}: {
  targetReady?: boolean
  onConnect?: () => void
  connectionMessage?: string | null
  connecting?: boolean
}): ReactElement {
  const [workspaceMode, setWorkspaceMode] = useState<'automatic' | 'keyword'>('automatic')

  return (
    <section className="product-research" aria-label="亚马逊选品工作台">
      <header className="pr-workbench-header">
        <div>
          <div className="pr-eyebrow"><span className="pr-eyebrow-dot" /> ASIN CANDIDATE RESEARCH · US</div>
          <h2>发现值得验证的 ASIN</h2>
          <p>直接选择最细叶子类目；全部符合条件的真实 ASIN 都会输出，Top 3 进入深度研究，新品在下一轮重新发现。</p>
        </div>
        <div className="pr-header-actions">
          <span className={`pr-connection ${targetReady ? 'is-live' : 'is-demo'}`}><i />{targetReady ? 'SellerSprite 已连接 · Live' : 'SellerSprite 未连接'}</span>
          {!targetReady && onConnect ? <button type="button" className="pr-ghost-button" onClick={onConnect} disabled={connecting}>{connecting ? '连接中…' : '连接 SellerSprite'}</button> : null}
        </div>
      </header>

      <nav className="pr-mode-tabs" aria-label="研究模式" role="tablist">
        <button
          aria-controls="auto-research-panel"
          aria-selected={workspaceMode === 'automatic'}
          className={workspaceMode === 'automatic' ? 'is-active' : ''}
          id="pr-auto-mode-tab"
          onClick={() => setWorkspaceMode('automatic')}
          role="tab"
          type="button"
        >自动研究</button>
        <button
          aria-controls="keyword-opportunity-panel"
          aria-selected={workspaceMode === 'keyword'}
          className={workspaceMode === 'keyword' ? 'is-active' : ''}
          id="pr-keyword-mode-tab"
          onClick={() => setWorkspaceMode('keyword')}
          role="tab"
          type="button"
        >关键词选品</button>
      </nav>

      <AutoResearchPanel hidden={workspaceMode !== 'automatic'} targetReady={targetReady} />
      <KeywordOpportunityPanel hidden={workspaceMode !== 'keyword'} targetReady={targetReady} />
      {connectionMessage ? <div className="pr-connection-feedback" role="status"><span>连接状态</span><strong>{connectionMessage}</strong></div> : null}
    </section>
  )
}