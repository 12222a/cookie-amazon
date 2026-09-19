import type { GenerationResponse, ReferenceAsset } from './types'


const configuredDesignServiceUrl = (import.meta.env.VITE_DESIGN_SERVICE_URL as string | undefined)?.replace(/\/+$/, '') || ''
export const DESIGN_SERVICE_URL = import.meta.env.PROD ? configuredDesignServiceUrl : ''
export const CURRENT_DESIGN_MEMBER = '当前成员'

type FetchLike = typeof fetch

const friendlyMessage = (message: string | undefined, fallback: string): string => {
  if (!message) return fallback
  return /API|DIRECTUS|MODEL|PROVIDER|TOKEN|BASE_URL|endpoint|credential/i.test(message) ? fallback : message
}

const readJson = async <T>(response: Response, fallback: string): Promise<T> => {
  const data = await response.json().catch(() => ({})) as { error?: string } & T
  if (!response.ok) throw new Error(friendlyMessage(data.error, fallback))
  return data
}

const servicePath = (path: string): string => `${DESIGN_SERVICE_URL}${path}`

const resolveImageUrl = (imageUrl: string): string => {
  if (/^(data:|https?:|blob:)/i.test(imageUrl)) return imageUrl
  if (!DESIGN_SERVICE_URL) return imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`
  return new URL(imageUrl, `${DESIGN_SERVICE_URL}/`).toString()
}

const normalizeReference = (reference: ReferenceAsset): ReferenceAsset => ({
  ...reference,
  imageUrl: resolveImageUrl(reference.imageUrl),
})

export const buildGenerationPayload = (referenceIds: readonly string[]): { referenceIds?: string[]; autoSelectReferences?: boolean; requestedBy: string } =>
  referenceIds.length > 0
    ? { referenceIds: [...referenceIds], requestedBy: CURRENT_DESIGN_MEMBER }
    : { autoSelectReferences: true, requestedBy: CURRENT_DESIGN_MEMBER }

export const listSharedReferences = async (fetcher: FetchLike = fetch): Promise<ReferenceAsset[]> => {
  const response = await fetcher(servicePath('/api/references'))
  const payload = await readJson<{ references?: ReferenceAsset[] }>(response, '公司素材库暂时无法加载，请稍后重试。')
  return (payload.references ?? []).map(normalizeReference)
}

const fileToDataUrl = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return `data:${file.type};base64,${btoa(binary)}`
}

export const uploadSharedReferences = async (
  files: readonly File[],
  options: { title?: string; createdBy?: string; fetcher?: FetchLike } = {},
): Promise<ReferenceAsset[]> => Promise.all(files.map(async (file) => {
  const response = await (options.fetcher ?? fetch)(servicePath('/api/references'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      dataUrl: await fileToDataUrl(file),
      ...(options.title?.trim() ? { title: options.title.trim() } : {}),
      ...(options.createdBy?.trim() ? { uploadedBy: options.createdBy.trim() } : {}),
    }),
  })
  const payload = await readJson<{ reference: ReferenceAsset }>(response, '图片上传未完成，请稍后重试。')
  return normalizeReference(payload.reference)
}))

export const deleteSharedReference = async (
  referenceId: string,
  fetcher: FetchLike = fetch,
): Promise<void> => {
  const response = await fetcher(servicePath(`/api/references/${encodeURIComponent(referenceId)}`), { method: 'DELETE' })
  await readJson<{ deleted?: boolean }>(response, '素材删除未完成，请稍后重试。')
}



export const generateDesign = async (
  referenceIds: readonly string[],
  fetcher: FetchLike = fetch,
): Promise<GenerationResponse> => {
  const response = await fetcher(servicePath('/api/generations'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildGenerationPayload(referenceIds)),
  })
  const payload = await readJson<GenerationResponse>(response, '本次生成未完成，请稍后重试。')
  return {
    ...payload,
    images: payload.images?.map(resolveImageUrl),
    error: payload.status === 'failed' ? friendlyMessage(payload.error, '本次生成未完成，请稍后重试。') : payload.error,
  }
}
