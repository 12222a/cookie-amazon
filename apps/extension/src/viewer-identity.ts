import type { StorageArea } from './remote-config'

export const VIEWER_IDENTITY_STORAGE_KEY = 'viewer-identity:v1'

const MAX_LENGTH = 64

export type ViewerIdentity = {
  name: string
  group: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const bounded = (value: unknown): string =>
  typeof value === 'string' ? value.trim().slice(0, MAX_LENGTH) : ''

/**
 * 使用者的身份：名字 + 小组。
 *
 * 按 C5 的决定沿用字符串标识（对应仓库里已有的 requestedBy / 管理员 常量那套），
 * 不引入 SSO。两项都必填——只有名字无法判断该看哪个小组的研究记录，
 * 只有小组则无法回答「谁研究过」。
 */
export const createViewerIdentity = (input: { name: unknown; group: unknown }): ViewerIdentity | null => {
  const name = bounded(input.name)
  const group = bounded(input.group)
  if (name.length === 0 || group.length === 0) return null
  return { name, group }
}

export const isViewerIdentity = (value: unknown): value is ViewerIdentity => {
  if (!isRecord(value)) return false
  const name = bounded(value.name)
  const group = bounded(value.group)
  return name.length > 0 && group.length > 0
}

export const describeViewer = (identity: ViewerIdentity | null): string =>
  identity === null ? '未设置身份' : `${identity.name} · ${identity.group}`

/**
 * 身份的存放处。
 *
 * 与当前分析对象、研究记录分开存放：对象是按 ASIN 变的，身份是人的属性，
 * 切换对象不该把「我是谁」清掉。
 */
export class ViewerIdentityStore {
  public constructor(private readonly storage: StorageArea) {}

  public async read(): Promise<ViewerIdentity | null> {
    try {
      const stored = (await this.storage.get(VIEWER_IDENTITY_STORAGE_KEY))[VIEWER_IDENTITY_STORAGE_KEY]
      return isViewerIdentity(stored) ? createViewerIdentity({ name: stored.name, group: stored.group }) : null
    } catch {
      return null
    }
  }

  public async write(identity: ViewerIdentity): Promise<boolean> {
    try {
      await this.storage.set({ [VIEWER_IDENTITY_STORAGE_KEY]: identity })
      return true
    } catch {
      return false
    }
  }
}

