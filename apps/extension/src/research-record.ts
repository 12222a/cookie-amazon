import { normalizeAsin } from './analysis-object'

export const RESEARCH_STATUSES = ['researching', 'verified', 'rejected'] as const

export type ResearchStatus = typeof RESEARCH_STATUSES[number]

export type ResearchRecord = {
  asin: string
  market: string
  owner: string
  group: string
  status: ResearchStatus
  summary: string
  updatedAt: number
}

export type ResearchViewer = { name: string; group: string }

export type CreateResearchRecordInput = {
  asin: string
  market: string
  owner: string
  group: string
  summary: string
  status?: ResearchStatus
  now?: number
}

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isResearchStatus = (value: unknown): value is ResearchStatus =>
  RESEARCH_STATUSES.includes(value as ResearchStatus)

/**
 * 一条研究记录：谁、在哪个小组、对这个 ASIN 得出了什么。
 *
 * 归属人与小组是必填的——没有归属的记录无法回答「谁研究过」，也就没有存在的意义。
 * 因此缺任一项直接返回 null，而不是存一条半成品进去。
 */
export const createResearchRecord = (input: CreateResearchRecordInput): ResearchRecord | null => {
  const asin = normalizeAsin(input.asin)
  if (asin === null) return null
  const market = text(input.market)
  if (market.length === 0) return null
  const owner = text(input.owner)
  const group = text(input.group)
  if (owner.length === 0 || group.length === 0) return null
  const status = input.status ?? 'researching'
  if (!isResearchStatus(status)) return null
  return {
    asin,
    market: market.toUpperCase(),
    owner,
    group,
    status,
    summary: text(input.summary),
    updatedAt: input.now ?? Date.now(),
  }
}

export type UpdateResearchRecordInput = {
  summary: string
  status: ResearchStatus
  now?: number
}

/**
 * 编辑一条已有记录。
 *
 * 只允许改摘要与状态：归属人与小组是这条记录的坐标，改掉它等于把记录换给别人，
 * 那不是「编辑」，所以这里显式忽略传入的这些字段。
 */
export const updateResearchRecord = (
  record: ResearchRecord,
  input: UpdateResearchRecordInput,
): ResearchRecord | null => {
  if (!isResearchStatus(input.status)) return null
  return {
    ...record,
    summary: text(input.summary),
    status: input.status,
    updatedAt: input.now ?? Date.now(),
  }
}

/** 只有作者本人能改自己的研究记录。同组同事只能看，不能改。 */
export const canEditRecord = (record: ResearchRecord, viewer: ResearchViewer | null): boolean =>
  viewer !== null && text(viewer.name) === record.owner

/**
 * 记录只对本小组可见。
 *
 * 注意：这是决定「渲染不渲染」的判断，不是访问控制。
 * 真正的隔离必须落在服务端——见 issue #7 的说明。
 */
export const visibleToGroup = (record: ResearchRecord, group: string | null): boolean => {
  const viewerGroup = text(group)
  return viewerGroup.length > 0 && viewerGroup === record.group
}

/** 存储里的记录可能是旧版本或被改过，读之前一律校验。 */
export const isResearchRecord = (value: unknown): value is ResearchRecord => {
  if (!isRecord(value)) return false
  if (typeof value.asin !== 'string' || normalizeAsin(value.asin) === null) return false
  if (typeof value.market !== 'string' || value.market.length === 0) return false
  if (typeof value.owner !== 'string' || value.owner.length === 0) return false
  if (typeof value.group !== 'string' || value.group.length === 0) return false
  if (!isResearchStatus(value.status)) return false
  if (typeof value.summary !== 'string') return false
  return typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
}

