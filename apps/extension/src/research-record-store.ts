import type { StorageArea } from './remote-config'
import { isResearchRecord, type ResearchRecord } from './research-record'

export const RESEARCH_RECORDS_STORAGE_KEY = 'research-records:v1'

/**
 * 两条记录是不是「同一条」。
 *
 * 必须带上 group：不同小组各研究同一个 ASIN 是完全正常的，
 * 只比 ASIN + 市场会让后保存的人覆盖掉别人的结论——那是数据丢失，不是去重。
 */
const sameRecord = (left: ResearchRecord, right: ResearchRecord): boolean =>
  left.asin === right.asin && left.market === right.market && left.group === right.group

/**
 * 研究记录的存放处。
 *
 * 按 ASIN + 市场 + 小组去重：同一个人反复研究同一个对象时覆盖旧结论而不是堆叠，
 * 否则「同事研究过什么」会被自己的历史淹没。
 *
 * 读接口 takeGroup 是唯一的可见性入口，调用方拿不到别的组的记录——
 * 把隔离放在读取处而不是渲染处，少一个「忘了过滤」的机会。
 *
 * 当前落在扩展本地存储，因此同一浏览器内的人共享这份数据；
 * 跨人共享与真正的强制隔离需要服务端，见 issue #7。
 */
export class ResearchRecordStore {
  public constructor(private readonly storage: StorageArea) {}

  /** 读出全部记录。只给同组使用与维护路径用，界面取数请走 readForGroup。 */
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

  /** 只返回该小组能看到的记录；组别未知时一条都不给。 */
  public async readForGroup(group: string | null): Promise<ResearchRecord[]> {
    return ResearchRecordStore.forGroup(await this.read(), group)
  }

  /** 找某个 ASIN 在本小组内的记录，用于回答「同事研究过吗」。 */
  public async find(asin: string, group: string | null): Promise<ResearchRecord | null> {
    return (await this.readForGroup(group)).find((record) => record.asin === asin) ?? null
  }

  public async save(record: ResearchRecord): Promise<boolean> {
    const records = await this.read()
    const index = records.findIndex((existing) => sameRecord(existing, record))
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

  /** 该小组能看到的子集。组别为空或只有空白时不返回任何记录。 */
  public static forGroup(records: readonly ResearchRecord[], group: string | null): ResearchRecord[] {
    if (typeof group !== 'string') return []
    const viewerGroup = group.trim()
    if (viewerGroup.length === 0) return []
    return records.filter((record) => record.group === viewerGroup)
  }
}
