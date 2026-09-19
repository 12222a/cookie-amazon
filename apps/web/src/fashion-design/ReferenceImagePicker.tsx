import { useRef, useState, type ChangeEvent, type DragEvent, type ReactElement } from 'react'
import type { ReferenceAsset } from './types'

const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxFiles = 12
const maxBytes = 10 * 1024 * 1024

export function ReferenceImagePicker({
  references,
  selectedIds,
  loading,
  uploading,
  error,
  onUpload,
  onToggle,
  onDelete,
  onRefresh,
}: {
  references: ReferenceAsset[]
  selectedIds: string[]
  loading: boolean
  uploading: boolean
  error: string | null
  onUpload: (files: File[]) => Promise<void>
  onToggle: (id: string) => void
  onDelete: (id: string) => Promise<void>
  onRefresh: () => void
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const acceptFiles = async (incoming: File[]): Promise<void> => {
    const valid = incoming.filter((file) => acceptedTypes.has(file.type) && file.size <= maxBytes).slice(0, maxFiles)
    setValidationError(valid.length === incoming.length ? null : '部分图片未上传：仅支持 JPG、PNG、WEBP，单张不超过 10MB，一次最多 12 张。')
    if (valid.length) await onUpload(valid)
  }

  const onInput = (event: ChangeEvent<HTMLInputElement>): void => {
    void acceptFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    void acceptFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <section className="fd-card fd-reference-card">
      <header className="fd-card-head"><div><span>01 / COMPANY LIBRARY</span><h2>公司共享参考图库</h2></div><b>{selectedIds.length ? `已选 ${selectedIds.length} 张` : `${references.length} 张素材`}</b></header>
      <div className="fd-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onInput} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <strong>{uploading ? '正在保存到共享图库…' : '上传喜欢的裙子图片'}</strong>
          <span>点击选择或将图片拖到这里，上传后公司成员都可以查看和使用</span>
        </button>
        <small>JPG / PNG / WEBP · 单张不超过 10MB · 一次最多 12 张</small>
      </div>
      {validationError || error ? <p className="fd-inline-error" role="alert">{validationError ?? error}</p> : null}
      <div className="fd-library-toolbar">
        <div><strong>共享素材</strong><span>{selectedIds.length ? '已选素材将用于本次设计' : '未选择时，将从共享图库中自动选取参考'}</span></div>
        <button type="button" onClick={onRefresh} disabled={loading}>{loading ? '刷新中…' : '刷新图库'}</button>
      </div>
      {loading && !references.length ? <div className="fd-reference-empty"><span>↻</span><p>正在加载公司共享素材…</p></div> : null}
      {!loading && !references.length ? <div className="fd-reference-empty"><span>+</span><p>共享图库还没有图片。上传第一批喜欢的裙子，其他成员刷新后也能看到。</p></div> : null}
      {references.length ? <div className="fd-reference-grid">{references.map((reference) => {
        const selected = selectedIds.includes(reference.id)
        return <article key={reference.id} className={selected ? 'is-selected' : ''}>
          <button type="button" className="fd-reference-select" onClick={() => onToggle(reference.id)} aria-pressed={selected}>
            <img src={reference.imageUrl} alt={reference.title} />
            <div><strong>{reference.title}</strong><small>{new Date(reference.uploadedAt).toLocaleDateString('zh-CN')}{reference.uploadedBy ? ` · ${reference.uploadedBy}` : ''}</small></div>
            <span>{selected ? '已选择' : '选择'}</span>
          </button>
          <button type="button" className="fd-reference-delete" onClick={() => {
            if (window.confirm(`确认删除“${reference.title}”吗？删除后公司成员将无法继续使用它。`)) void onDelete(reference.id)
          }} aria-label={`删除 ${reference.title}`}>
            删除素材
          </button>
        </article>
      })}</div> : null}
    </section>
  )
}