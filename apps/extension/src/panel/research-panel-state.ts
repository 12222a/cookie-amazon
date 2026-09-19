import type { ResearchStatus } from '../research-record'

/**
 * 展示层只关心这几个字段。
 *
 * 服务器返回的记录还带着 asin/market/group，这里刻意不要求它们：
 * 界面不按组过滤（过滤是服务端的事），拿到什么就显示什么。
 */
export type DisplayableRecord = {
  owner: string
  status: ResearchStatus
  summary: string
  updatedAt: number
}

/**
 * 别人（同组同事）留下的记录怎么展示。
 *
 * 判别联合而不是「有 owner 但可能是 null」：没有记录时就不该有归属人，
 * 让类型把这件事说清楚，调用方也就不会写出「没有记录却去读 owner」的代码。
 */
export type ColleagueRecordState =
  | { kind: 'none'; note: string }
  | { kind: 'colleague'; owner: string; ageLabel: string; note: string }

/**
 * 作者自己写这条记录时，表单要预填已有内容。
 *
 * 不含「能不能写」的判断：那条规则只在服务端（research-api 的 ON CONFLICT WHERE owner），
 * 客户端说了不算，所以在界面层也不该再放一个可能与之不符的判断。
 */
export type OwnerRecordState = {
  summary: string
  status: ResearchStatus
}

export const RESEARCH_STATUS_LABELS: Record<ResearchStatus, string> = {
  researching: '研究中',
  verified: '已验证',
  rejected: '已否决',
}

/**
 * 把时间戳说成「多久以前」。
 *
 * 同事的研究记录只有在标了时间之后才有判断价值——三天前的结论和三个月前的结论
 * 对同一个 ASIN 意味着完全不同的可信度。
 *
 * 接受 now 参数是为了可测；默认取当前时间。
 */
export const describeRecordAge = (updatedAt: number, now: number = Date.now()): string => {
  const elapsed = now - updatedAt
  if (!Number.isFinite(elapsed) || elapsed < 0) return '时间未知'
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return `${Math.floor(days / 30)} 个月前`
}

/**
 * 把同组的既有记录翻译成一句人话。
 *
 * 目标是让用户立刻知道：有没有人做过、是谁、多久以前、结论是什么。
 * 摘要为空时不省略——「同事看了但没写结论」本身也是信息。
 */
export const describeColleagueRecord = (record: DisplayableRecord | null): ColleagueRecordState => {
  if (record === null) return { kind: 'none', note: '本小组还没有人研究过这个 ASIN。' }
  const status = RESEARCH_STATUS_LABELS[record.status]
  const summary = record.summary.length > 0 ? record.summary : '（未填写结论摘要）'
  const ageLabel = describeRecordAge(record.updatedAt)
  return {
    kind: 'colleague',
    owner: record.owner,
    ageLabel,
    note: `${record.owner} · ${status} · ${ageLabel}：${summary}`,
  }
}

export const describeRecordForOwner = (record: DisplayableRecord | null): OwnerRecordState => ({
  summary: record?.summary ?? '',
  status: record?.status ?? 'researching',
})
