import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { generateDesign, listSharedReferences, deleteSharedReference, uploadSharedReferences } from './generation-client'
import { GenerationResults } from './GenerationResults'
import { ReferenceImagePicker } from './ReferenceImagePicker'
import type { GenerationView, ReferenceAsset } from './types'

export function FashionDesignWorkspace(): ReactElement {
  const [references, setReferences] = useState<ReferenceAsset[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [result, setResult] = useState<GenerationView | null>(null)
  const [loadingLibrary, setLoadingLibrary] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [libraryError, setLibraryError] = useState<string | null>(null)

  const refreshLibrary = useCallback(async (): Promise<void> => {
    setLoadingLibrary(true)
    setLibraryError(null)
    try {
      const items = await listSharedReferences()
      setReferences(items)
      setSelectedIds((current) => current.filter((id) => items.some((item) => item.id === id)))
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : '公司素材库暂时无法加载，请稍后重试。')
    } finally {
      setLoadingLibrary(false)
    }
  }, [])

  useEffect(() => { void refreshLibrary() }, [refreshLibrary])

  const upload = async (files: File[]): Promise<void> => {
    setUploading(true)
    setLibraryError(null)
    try {
      const uploaded = await uploadSharedReferences(files)
      setReferences((current) => [...uploaded, ...current.filter((item) => !uploaded.some((next) => next.id === item.id))])
      setSelectedIds((current) => [...new Set([...current, ...uploaded.map((item) => item.id)])].slice(0, 4))
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : '图片上传未完成，请稍后重试。')
    } finally {
      setUploading(false)
    }
  }

  const runGeneration = async (): Promise<void> => {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`
    const requestedAt = new Date().toISOString()
    setResult({ id, requestedAt, status: 'running' })
    try {
      const response = await generateDesign(selectedIds)
      setResult({ ...response, id, requestedAt })
    } catch (reason) {
      setResult({ id, requestedAt, status: 'failed', error: reason instanceof Error ? reason.message : '本次生成未完成，请稍后重试。' })
    }
  }

  const removeReference = async (referenceId: string): Promise<void> => {
    setLibraryError(null)
    try {
      await deleteSharedReference(referenceId)
      setReferences((current) => current.filter((item) => item.id !== referenceId))
      setSelectedIds((current) => current.filter((id) => id !== referenceId))
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : '素材删除未完成，请稍后重试。')
    }
  }

  const toggleReference = (id: string): void => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= 4) {
        setLibraryError('每次最多选择 4 张参考图。')
        return current
      }
      setLibraryError(null)
      return [...current, id]
    })
  }

  const isGenerating = result?.status === 'running' || result?.status === 'queued'

  return (
    <section className="fashion-design" id="fashion-design">
      <header className="fd-hero">
        <div><span className="fd-eyebrow"><i /> COOKIE AMAZON · FASHION DESIGN</span><h1>把团队收藏的好款，变成<em>今天的新设计</em></h1><p>共享参考和持续创作集中在同一工作区，生成图片会保存下来，方便后续推送到企业微信。</p></div>
        <aside><span>当前创作状态</span><strong>{selectedIds.length ? `使用已选的 ${selectedIds.length} 张共享素材` : '可从共享图库自动选取参考'}</strong><small>手动生成的图片会统一保存</small></aside>
      </header>
      <div className="fd-metric-strip"><div><span>TEAM LIBRARY</span><strong>{references.length}</strong><small>公司共享素材</small></div><div><span>SELECTED</span><strong>{selectedIds.length}</strong><small>本次选用参考</small></div></div>
      <div className="fd-workspace-grid">
        <div className="fd-control-column">
          <ReferenceImagePicker
            references={references}
            selectedIds={selectedIds}
            loading={loadingLibrary}
            uploading={uploading}
            error={libraryError}
            onUpload={upload}
            onToggle={toggleReference}
            onDelete={removeReference}
            onRefresh={() => void refreshLibrary()}
          />
          <section className="fd-card fd-action-card">
            <header className="fd-card-head"><div><span>02 / CREATE</span><h2>生成今日新款</h2></div><b>{selectedIds.length ? '指定参考' : '自动选取'}</b></header>
            <p className="fd-daily-note">{selectedIds.length ? `将参考已选的 ${selectedIds.length} 张裙装，生成同品类但设计元素明显不同的新款。` : '直接开始后，将从公司共享图库中自动选择参考，适合每天持续产出新的裙装图片。'}</p>
            <button className="fd-generate-button" type="button" disabled={isGenerating || uploading || (!references.length && !selectedIds.length)} onClick={() => void runGeneration()}>{isGenerating ? <><i />正在生成新款…</> : '开始生成'}</button>
          </section>
        </div>
        <GenerationResults result={result} onRetry={() => void runGeneration()} />
      </div>
      <footer className="fd-footer"><span><i />公司设计创作空间</span><span>共享参考 · 每日生成 · 图片留存 · 企业微信推送准备</span></footer>
    </section>
  )
}