import type { ResearchRecord, ResearchStatus } from '../research-record'

/**
 * 别人（同组同事）留下的记录怎么展示。
 *
 * 判别联合而不是「有 owner 但可能是 null」：没有记录时就不该有归属人，
 * 让类型把这件事说清楚，调用方也就不会写出「没有记录却去读 owner」的代码。
 */
export type ColleagueRecordState =
  | { kind: 'none'; note: string }
  | { kind: 'colleague'; owner: string; note: string }

export type OwnerRecordState = {
  editable: boolean
  summary: string
  status: ResearchStatus
}

const STATUS_LABELS: Record<ResearchStatus, string> = {
  researching: '研究中',
  verified: '已验证',
  rejected: '已否决',
}

/**
 * 把同组的既有记录翻译成一句人话。
 *
 * 目标是让用户立刻知道：有没有人做过、是谁、结论是什么。
 * 摘要为空时不省略——「同事看了但没写结论」本身也是信息。
 */
export const describeColleagueRecord = (record: ResearchRecord | null): ColleagueRecordState => {
  if (record === null) return { kind: 'none', note: '本小组还没有人研究过这个 ASIN。' }
  const status = STATUS_LABELS[record.status]
  const summary = record.summary.length > 0 ? record.summary : '（未填写结论摘要）'
  return {
    kind: 'colleague',
    owner: record.owner,
    note: `${record.owner} · ${status}：${summary}`,
  }
}

/**
 * 作者自己写这条记录时，表单要预填已有内容，而不是让他重打一遍。
 * 没有记录时给一个空表单——第一次写与修订走同一条路径。
 *
 * editable 只是给界面用的提示；能不能写最终由 canEditRecord 判定，
 * 那样「只有作者能改」这条规则只有一个来源。
 */
export const describeRecordForOwner = (record: ResearchRecord | null): OwnerRecordState => ({
  editable: true,
  summary: record?.summary ?? '',
  status: record?.status ?? 'researching',
})
