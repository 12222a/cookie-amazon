/**
 * 研究记录的状态枚举。
 *
 * 记录的读写已经搬到服务端（见 cloudflare/config-worker/src/research-api.ts），
 * 本地只保留「状态有哪些取值」这一个契约：界面用它渲染下拉与标签，
 * 客户端提交时也用它归一非法值。
 */
export const RESEARCH_STATUSES = ['researching', 'verified', 'rejected'] as const

export type ResearchStatus = typeof RESEARCH_STATUSES[number]

export const isResearchStatus = (value: unknown): value is ResearchStatus =>
  RESEARCH_STATUSES.includes(value as ResearchStatus)

