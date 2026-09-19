import type { ReactElement } from 'react'
import type { GenerationView } from './types'

export function GenerationResults({ result, onRetry }: { result: GenerationView | null; onRetry: () => void }): ReactElement {
  return (
    <section className="fd-card fd-results-card">
      <header className="fd-card-head"><div><span>03 / GENERATED DESIGNS</span><h2>生成结果</h2></div><b className={result ? `is-${result.status}` : ''}>{result?.status === 'succeeded' ? '已完成' : result?.status === 'failed' ? '未完成' : result ? '生成中' : '等待开始'}</b></header>
      {!result ? <div className="fd-results-empty"><span>✦</span><h3>等待第一次设计生成</h3><p>从公司共享图库选择参考，或保持未选择并自动取样，生成的新款会展示在这里。</p></div> : null}
      {result?.status === 'running' || result?.status === 'queued' ? <div className="fd-results-empty is-running"><i /><h3>正在生成新的裙装款式</h3><p>请稍候，完成后可以在这里查看和下载。</p></div> : null}
      {result?.status === 'failed' ? <div className="fd-results-empty is-failed"><span>!</span><h3>本次生成未完成</h3><p>{result.error}</p><button type="button" onClick={onRetry}>重新生成</button></div> : null}
      {result?.status === 'succeeded' ? <>
        {result.persistenceWarning ? <p className="fd-storage-warning">图片已生成，但本次记录未能保存完整，请及时下载需要的款式。</p> : null}
        {result.composedPrompt ? <details className="fd-composed-prompt"><summary>查看本次设计说明</summary><p>{result.composedPrompt}</p></details> : null}
        <div className="fd-result-grid">{(result.images ?? []).map((image, index) => (
          <article key={`${image}-${index}`}><div className="fd-result-image"><img src={image} alt={`生成的裙子款式 ${index + 1}`} /><span>DESIGN {String(index + 1).padStart(2, '0')}</span></div><footer><div><strong>生成款式 {index + 1}</strong><small>{new Date(result.requestedAt).toLocaleString('zh-CN')}</small></div><a href={image} download={`cookie-amazon-dress-${index + 1}.png`} target="_blank" rel="noreferrer">下载 ↗</a></footer></article>
        ))}</div>
        {!result.images?.length ? <div className="fd-results-empty"><p>本次没有得到可展示的图片，请重新生成。</p></div> : null}
      </> : null}
    </section>
  )
}