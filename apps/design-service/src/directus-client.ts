import { imageInputToBlob } from '@cookie-amazon/image-generation'

export type DirectusClientConfig = {
  url?: string
  token?: string
  fetch?: typeof globalThis.fetch
}

export type DirectusFile = { id: string }

export type DirectusClient = {
  readonly enabled: boolean
  createItem<T>(collection: string, payload: Record<string, unknown>): Promise<T | null>
  updateItem<T>(collection: string, id: string, payload: Record<string, unknown>): Promise<T | null>
  listItems<T>(collection: string, query?: string): Promise<T[] | null>
  getItem<T>(collection: string, id: string): Promise<T | null>
  uploadFile(dataUrl: string, filename: string, title?: string): Promise<DirectusFile | null>
  getAsset(fileId: string): Promise<Response | null>
}

export const createDirectusClient = (config: DirectusClientConfig): DirectusClient => {
  const baseUrl = config.url?.replace(/\/+$/, '') ?? ''
  const token = config.token?.trim() ?? ''
  const fetcher = config.fetch ?? fetch
  const enabled = Boolean(baseUrl && token)

  const request = async <T>(path: string, init: RequestInit): Promise<T | null> => {
    if (!enabled) return null
    const response = await fetcher(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...init.headers,
      },
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Directus 请求失败（HTTP ${response.status}）：${detail.slice(0, 500)}`)
    }
    const payload = await response.json() as { data: T }
    return payload.data
  }

  return {
    enabled,
    createItem: <T>(collection: string, payload: Record<string, unknown>) => request<T>(`/items/${encodeURIComponent(collection)}`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
    updateItem: <T>(collection: string, id: string, payload: Record<string, unknown>) => request<T>(`/items/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify(payload),
    }),
    listItems: <T>(collection: string, query = '') => request<T[]>(`/items/${encodeURIComponent(collection)}${query ? `?${query}` : ''}`, {
      method: 'GET',
    }),
    getItem: <T>(collection: string, id: string) => request<T>(`/items/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
      method: 'GET',
    }),
    async uploadFile(dataUrl, filename, title) {
      if (!enabled) return null
      const blob = await imageInputToBlob(dataUrl, fetcher)
      const form = new FormData()
      form.append('file', blob, filename)
      if (title?.trim()) form.append('title', title.trim())
      const response = await fetcher(`${baseUrl}/files`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`共享图片上传失败（HTTP ${response.status}）：${detail.slice(0, 500)}`)
      }
      return ((await response.json()) as { data: DirectusFile }).data
    },
    async getAsset(fileId) {
      if (!enabled) return null
      const response = await fetcher(`${baseUrl}/assets/${encodeURIComponent(fileId)}`, {
        headers: { authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`共享图片读取失败（HTTP ${response.status}）`)
      return response
    },
  }
}