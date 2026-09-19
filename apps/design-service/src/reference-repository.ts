import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DirectusClient } from './directus-client'

export type SharedFashionReference = {
  id: string
  title: string
  category: string
  uploadedBy: string
  uploadedAt: string
  usedCount: number
  lastUsedAt?: string
  imageUrl: string
}

export type CreateSharedReferenceInput = {
  title?: string
  filename: string
  dataUrl: string
  uploadedBy?: string
}

type ReferenceRecord = {
  id: string
  title?: string | null
  category?: string | null
  source_image?: string | { id?: string } | null
  uploaded_by?: string | null
  date_created?: string | null
  used_count?: number | null
  last_used_at?: string | null
  status?: string | null
}

export type SharedReferenceRepository = {
  readonly enabled: boolean
  list(): Promise<SharedFashionReference[]>
  create(input: CreateSharedReferenceInput): Promise<SharedFashionReference>
  getImage(referenceId: string): Promise<Response>
  getDataUrl(referenceId: string): Promise<string>
  selectForDaily(limit?: number): Promise<SharedFashionReference[]>
  markUsed(reference: SharedFashionReference): Promise<void>
}

const sourceImageId = (record: ReferenceRecord): string => {
  if (typeof record.source_image === 'string') return record.source_image
  return record.source_image?.id ?? ''
}

const mapReference = (record: ReferenceRecord): SharedFashionReference => ({
  id: record.id,
  title: record.title?.trim() || '未命名裙装参考',
  category: record.category?.trim() || '女士裙装',
  uploadedBy: record.uploaded_by?.trim() || '内部成员',
  uploadedAt: record.date_created || new Date(0).toISOString(),
  usedCount: Math.max(0, Number(record.used_count || 0)),
  ...(record.last_used_at ? { lastUsedAt: record.last_used_at } : {}),
  imageUrl: `/api/references/${encodeURIComponent(record.id)}/image`,
})

const ensureEnabled = (directus: DirectusClient): void => {
  if (!directus.enabled) throw new Error('共享图库尚未配置，请联系管理员完成内部存储配置')
}

const fields = 'id,title,category,source_image,uploaded_by,date_created,used_count,last_used_at,status'

type LocalReferenceRecord = SharedFashionReference & { imageFilename: string; mimeType: string }

const decodeDataUrl = (value: string): { mimeType: string; bytes: Buffer } => {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(value)
  if (!match) throw new Error('共享图片必须是 PNG、JPEG 或 WEBP 格式')
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('共享图片不能为空且单张不能超过 10MB')
  return { mimeType: match[1].toLowerCase(), bytes }
}

export const createLocalSharedReferenceRepository = (
  storageDirectory = resolve(process.cwd(), 'data', 'fashion-references'),
): SharedReferenceRepository => {
  const metadataPath = resolve(storageDirectory, 'references.json')
  const imageDirectory = resolve(storageDirectory, 'images')
  let writeQueue = Promise.resolve()

  const ensureStorage = async (): Promise<void> => {
    await mkdir(imageDirectory, { recursive: true })
  }
  const readRecords = async (): Promise<LocalReferenceRecord[]> => {
    await ensureStorage()
    try {
      const parsed = JSON.parse(await readFile(metadataPath, 'utf8')) as unknown
      return Array.isArray(parsed) ? parsed as LocalReferenceRecord[] : []
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }
  const writeRecords = async (records: LocalReferenceRecord[]): Promise<void> => {
    await ensureStorage()
    await writeFile(metadataPath, JSON.stringify(records, null, 2), 'utf8')
  }
  const updateRecords = async <T>(change: (records: LocalReferenceRecord[]) => Promise<[LocalReferenceRecord[], T]>): Promise<T> => {
    let result!: T
    writeQueue = writeQueue.then(async () => {
      const [records, value] = await change(await readRecords())
      await writeRecords(records)
      result = value
    })
    await writeQueue
    return result
  }
  const publicReference = ({ imageFilename: _imageFilename, mimeType: _mimeType, ...reference }: LocalReferenceRecord): SharedFashionReference => reference

  return {
    enabled: true,
    async list() {
      return (await readRecords()).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).map(publicReference)
    },
    async create(input) {
      const { mimeType, bytes } = decodeDataUrl(input.dataUrl)
      const id = randomUUID()
      const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
      const imageFilename = `${id}.${extension}`
      const uploadedAt = new Date().toISOString()
      const record: LocalReferenceRecord = {
        id,
        title: input.title?.trim() || input.filename,
        category: '女士裙装',
        uploadedBy: input.uploadedBy?.trim() || '内部成员',
        uploadedAt,
        usedCount: 0,
        imageUrl: `/api/references/${encodeURIComponent(id)}/image`,
        imageFilename,
        mimeType,
      }
      await ensureStorage()
      await writeFile(resolve(imageDirectory, imageFilename), bytes)
      await updateRecords(async (records) => [[record, ...records], undefined])
      return publicReference(record)
    },
    async getImage(referenceId) {
      const record = (await readRecords()).find((item) => item.id === referenceId)
      if (!record) throw new Error('共享参考图不存在或已停用')
      const bytes = Uint8Array.from(await readFile(resolve(imageDirectory, record.imageFilename)))
      return new Response(bytes.buffer, { headers: { 'content-type': record.mimeType } })
    },
    async getDataUrl(referenceId) {
      const response = await this.getImage(referenceId)
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      const bytes = Buffer.from(await response.arrayBuffer())
      return `data:${contentType};base64,${bytes.toString('base64')}`
    },
    async selectForDaily(limit = 1) {
      const safeLimit = Math.max(1, Math.min(4, Math.floor(limit)))
      const records = await readRecords()
      const selected = records.sort((a, b) => a.usedCount - b.usedCount || (a.lastUsedAt || '').localeCompare(b.lastUsedAt || '') || a.uploadedAt.localeCompare(b.uploadedAt)).slice(0, safeLimit)
      if (!selected.length) throw new Error('共享图库中还没有可用于每日生成的裙装图片')
      return selected.map(publicReference)
    },
    async markUsed(reference) {
      await updateRecords(async (records) => [records.map((item) => item.id === reference.id ? {
        ...item, usedCount: item.usedCount + 1, lastUsedAt: new Date().toISOString(),
      } : item), undefined])
    },
  }
}

export const createSharedReferenceRepository = (directus: DirectusClient): SharedReferenceRepository => ({
  enabled: directus.enabled,
  async list() {
    ensureEnabled(directus)
    const query = `fields=${encodeURIComponent(fields)}&filter[status][_eq]=active&sort=-date_created&limit=100`
    const records = await directus.listItems<ReferenceRecord>('fashion_references', query)
    return (records ?? []).filter((record) => Boolean(sourceImageId(record))).map(mapReference)
  },
  async create(input) {
    ensureEnabled(directus)
    const file = await directus.uploadFile(input.dataUrl, input.filename, input.title || input.filename)
    if (!file?.id) throw new Error('共享图片上传后没有返回文件编号')
    const record = await directus.createItem<ReferenceRecord>('fashion_references', {
      title: input.title?.trim() || input.filename,
      category: '女士裙装',
      source_image: file.id,
      uploaded_by: input.uploadedBy?.trim() || '内部成员',
      status: 'active',
      used_count: 0,
    })
    if (!record?.id) throw new Error('共享图片记录创建失败')
    return mapReference(record)
  },
  async getImage(referenceId) {
    ensureEnabled(directus)
    const record = await directus.getItem<ReferenceRecord>('fashion_references', referenceId)
    const fileId = record ? sourceImageId(record) : ''
    if (!fileId || record?.status !== 'active') throw new Error('共享参考图不存在或已停用')
    const response = await directus.getAsset(fileId)
    if (!response) throw new Error('共享参考图读取失败')
    return response
  },
  async getDataUrl(referenceId) {
    const response = await this.getImage(referenceId)
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const bytes = Buffer.from(await response.arrayBuffer())
    return `data:${contentType};base64,${bytes.toString('base64')}`
  },
  async selectForDaily(limit = 1) {
    ensureEnabled(directus)
    const safeLimit = Math.max(1, Math.min(4, Math.floor(limit)))
    const query = `fields=${encodeURIComponent(fields)}&filter[status][_eq]=active&sort=used_count,last_used_at,date_created&limit=${safeLimit}`
    const records = await directus.listItems<ReferenceRecord>('fashion_references', query)
    const references = (records ?? []).filter((record) => Boolean(sourceImageId(record))).map(mapReference)
    if (!references.length) throw new Error('共享图库中还没有可用于每日生成的裙装图片')
    return references
  },
  async markUsed(reference) {
    ensureEnabled(directus)
    await directus.updateItem('fashion_references', reference.id, {
      used_count: reference.usedCount + 1,
      last_used_at: new Date().toISOString(),
    })
  },
})