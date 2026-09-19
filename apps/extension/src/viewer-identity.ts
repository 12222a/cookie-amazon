import type { StorageArea } from './remote-config'

export const VIEWER_IDENTITY_STORAGE_KEY = 'viewer-identity:v2'

const MAX_TOKEN_LENGTH = 512

/**
 * 使用者的身份：一把访问密钥。
 *
 * 不再自填名字与小组——那两样由服务端按密钥决定，客户端说自己是谁没有意义：
 * 只要能写进请求体，就能冒充同事或读取别组的记录，隔离等于没有。
 * 密钥只存在本机浏览器里，用来换服务端认可的身份。
 */
export type ViewerIdentity = {
  token: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const boundedToken = (value: unknown): string =>
  typeof value === 'string' ? value.trim().slice(0, MAX_TOKEN_LENGTH) : ''

export const createViewerIdentity = (input: { token: unknown }): ViewerIdentity | null => {
  const token = boundedToken(input.token)
  return token.length === 0 ? null : { token }
}

export const isViewerIdentity = (value: unknown): value is ViewerIdentity =>
  isRecord(value) && boundedToken(value.token).length > 0

/**
 * 只显示有没有设置，不显示密钥本身——它不该出现在屏幕上，也不该进截图。
 *
 * 也不显示名字：名字由服务端按密钥决定，客户端没有可信来源，
 * 显示一个自己填的名字反而会让人以为身份是自报的。
 */
export const describeViewer = (identity: ViewerIdentity | null): string =>
  identity === null ? '未设置访问密钥' : '访问密钥已设置'

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
      return isViewerIdentity(stored) ? createViewerIdentity({ token: stored.token }) : null
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

  public async clear(): Promise<boolean> {
    try {
      await this.storage.set({ [VIEWER_IDENTITY_STORAGE_KEY]: null })
      return true
    } catch {
      return false
    }
  }
}
