import { isAnalysisObject, type AnalysisObject } from './analysis-object'

export const ANALYSIS_OBJECT_STORAGE_KEY = 'analysis-object:v1'

export type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

/**
 * 当前分析对象的唯一存放处。
 *
 * 放在扩展存储而不是页面内存里，是为了让选中状态跨页面切换、跨面板开关存活：
 * 亚马逊侧写入，侧边栏与页内浮层都从这里读，两边不会各存一份。
 *
 * 读写都吞掉存储异常：读不到就当作没有对象（面板显示空状态），写失败也不打断当前操作。
 */
export class AnalysisObjectStore {
  public constructor(
    private readonly storage: StorageArea,
    private readonly key: string = ANALYSIS_OBJECT_STORAGE_KEY,
  ) {}

  public async read(): Promise<AnalysisObject | null> {
    try {
      const stored = (await this.storage.get(this.key))[this.key]
      return isAnalysisObject(stored) ? stored : null
    } catch {
      return null
    }
  }

  public async write(value: AnalysisObject): Promise<void> {
    try {
      await this.storage.set({ [this.key]: value })
    } catch {
      // 存储不可用不阻断面板；下次写入会再试。
    }
  }
}

