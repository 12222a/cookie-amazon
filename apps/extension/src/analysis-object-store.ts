import { isAnalysisObject, type AnalysisObject } from './analysis-object'
import type { StorageArea } from './remote-config'

export const ANALYSIS_OBJECT_STORAGE_KEY = 'analysis-object:v1'

/**
 * 当前分析对象的唯一存放处。
 *
 * 放在扩展存储而不是页面内存里，是为了让选中状态跨页面切换、跨面板开关存活：
 * 亚马逊侧写入，侧边栏与页内浮层都从这里读，两边不会各存一份（ADR-0004 的单一状态源）。
 *
 * 读吞掉异常：读不到就当作没有对象，面板显示空状态。
 * 写返回是否成功：调用方要据此提示用户，不能把写失败变成静默无响应。
 */
export class AnalysisObjectStore {
  public constructor(private readonly storage: StorageArea) {}

  public async read(): Promise<AnalysisObject | null> {
    try {
      const stored = (await this.storage.get(ANALYSIS_OBJECT_STORAGE_KEY))[ANALYSIS_OBJECT_STORAGE_KEY]
      return isAnalysisObject(stored) ? stored : null
    } catch {
      return null
    }
  }

  public async write(value: AnalysisObject): Promise<boolean> {
    try {
      await this.storage.set({ [ANALYSIS_OBJECT_STORAGE_KEY]: value })
      return true
    } catch {
      return false
    }
  }
}
