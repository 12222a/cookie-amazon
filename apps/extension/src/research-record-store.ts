import type { StorageArea } from './remote-config'
import { isResearchRecord, type ResearchRecord } from './research-record'

export const RESEARCH_RECORDS_STORAGE_KEY = 'research-records:v1'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const sameTarget = (left: ResearchRecord, right: ResearchRecord): boolean =>
  left.asin === right.asin && left.market === right.market

/**
 * 研究记录的存放处。
 *
 * 按 ASIN + 市场去重：同一个人反复研究同一个对象时，覆盖旧记录而不是堆叠，
 * 否则「同事研究过什么」这个问题会被自己的历史淹没。
 *
 * 当前落在扩展本地存储，因此只用同一浏览器的人彼此可见——跨人共享需要服务端，
 * 见 issue #7 的说明与 docs/adr 的相关决定。
 */
export class ResearchRecordStore {
  public constructor(private readonly storage: StorageArea) {}

  public async read(): Promise<ResearchRecord[]> {
    try {
      const stored = (await this.storage.get(RESEARCH_RECORDS_STORAGE_KEY))[RESEARCH_RECORDS_STORAGE_KEY]
      if (!Array.isArray(stored)) return []
      // 逐条校验：一条坏数据不该让整份记录读不出来。
      return stored.filter(isResearchRecord)
    } catch {
      return []
    }
  }

  public async save(record: ResearchRecord): Promise<boolean> {
    const records = await this.read()
    const index = records.findIndex((existing) => sameTarget(existing, record))
    const next = index >= 0
      ? records.map((existing, at) => at === index ? record : existing)
      : [...records, record]
    try {
      await this.storage.set({ [RESEARCH_RECORDS_STORAGE_KEY]: next })
      return true
    } catch {
      return false
    }
  }

  /** 某条记录若属于该小组才返回；否则 null。渲染层据此决定显示不显示。 */
  public static forGroup(records: readonly ResearchRecord[], group: string | null): ResearchRecord[] {
    if (typeof group !== 'string') return []
    const viewerGroup = group.trim()
    if (viewerGroup.length === 0) return []
    return records.filter((record) => record.group === viewerGroup)
  }

  /** 找某个 ASIN 在指定小组内的记录，用于回答「同事研究过吗」。 */
  public static find(records: readonly ResearchRecord[], asin: string, group: string | null): ResearchRecord | null {
    return ResearchRecordStore.forGroup(records, group).find((record) => record.asin === asin) ?? null
  }

  public static isRecord(value: unknown): value is ResearchRecord {
    return isResearchRecord(value)
  }

  public static asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
  }

  public static isPlainRecord(value: unknown): value is Record<string, unknown> {
    return isRecord(value)
  }
}

