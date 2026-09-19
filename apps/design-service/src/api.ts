import type { AddCandidateReviewInput, CandidateStatus, DesignCollaborationRepository, GenerationReferenceLink } from './collaboration-repository'
import type { DesignGenerationRequest, GenerationService } from './generation-service'
import type { SharedReferenceRepository } from './reference-repository'

export type DesignApiConfig = { allowedOrigin: string; dailyReferenceCount?: number }

type GenerationSelection = {
  referenceImages: string[]
  referenceIds: string[]
  autoSelectReferences: boolean
  requestedBy?: string
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
})

const corsHeaders = (origin: string): Record<string, string> => ({
  'access-control-allow-origin': origin,
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  vary: 'Origin',
})

const requestOrigin = (request: Request, allowedOrigin: string): string => {
  const origin = request.headers.get('origin')
  return origin && origin === allowedOrigin ? origin : allowedOrigin
}

const objectBody = (value: unknown, message = '请求体必须是 JSON 对象'): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}

const optionalText = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined

const parseGeneration = (value: unknown): GenerationSelection => {
  const body = objectBody(value)
  const referenceImages = Array.isArray(body.referenceImages)
    ? body.referenceImages.filter((image): image is string => typeof image === 'string')
    : []
  const referenceIds = Array.isArray(body.referenceIds)
    ? body.referenceIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    : []
  const autoSelectReferences = body.autoSelectReferences === true || (!referenceImages.length && !referenceIds.length)
  if (referenceImages.length + referenceIds.length > 4) throw new Error('最多支持 4 张参考图')
  return { referenceImages, referenceIds, autoSelectReferences, requestedBy: optionalText(body.requestedBy) }
}

const parseUpload = (value: unknown): { title?: string; filename: string; dataUrl: string; uploadedBy?: string } => {
  const body = objectBody(value, '上传请求必须是 JSON 对象')
  if (typeof body.filename !== 'string' || !body.filename.trim()) throw new Error('图片文件名不能为空')
  if (typeof body.dataUrl !== 'string' || !body.dataUrl.trim()) throw new Error('图片内容不能为空')
  return {
    filename: body.filename.trim(),
    dataUrl: body.dataUrl,
    ...(optionalText(body.title) ? { title: optionalText(body.title) } : {}),
    ...(optionalText(body.uploadedBy) ? { uploadedBy: optionalText(body.uploadedBy) } : {}),
  }
}

const resolveGeneration = async (
  selection: GenerationSelection,
  references: SharedReferenceRepository,
  dailyReferenceCount = 1,
): Promise<{ request: DesignGenerationRequest; selected: Awaited<ReturnType<SharedReferenceRepository['selectForDaily']>> }> => {
  const selected = selection.autoSelectReferences && !selection.referenceImages.length && !selection.referenceIds.length
    ? await references.selectForDaily(dailyReferenceCount)
    : []
  const selectedIds = [...selection.referenceIds, ...selected.map((reference) => reference.id)]
  const links: GenerationReferenceLink[] = [
    ...selection.referenceIds.map((referenceId) => ({ referenceId, selectionMode: 'manual' as const })),
    ...selected.map((reference) => ({ referenceId: reference.id, selectionMode: 'automatic' as const })),
  ]
  return {
    request: {
      referenceImages: [
        ...selection.referenceImages,
        ...(await Promise.all(selectedIds.map((id) => references.getDataUrl(id)))),
      ],
      ...(links.length ? { references: links } : {}),
      ...(selection.requestedBy ? { requestedBy: selection.requestedBy } : {}),
    },
    selected,
  }
}

const candidateStatuses: CandidateStatus[] = ['pending_review', 'shortlisted', 'selected', 'rejected', 'archived']
const parseCandidateStatus = (value: string | null): CandidateStatus | undefined => {
  if (!value) return undefined
  if (!candidateStatuses.includes(value as CandidateStatus)) throw new Error('候选状态无效')
  return value as CandidateStatus
}

const parseFavorite = (value: unknown): { actor: string; favorited: boolean } => {
  const body = objectBody(value)
  const actor = optionalText(body.actor)
  if (!actor) throw new Error('成员名称不能为空')
  if (typeof body.favorited !== 'boolean') throw new Error('收藏状态必须是布尔值')
  return { actor, favorited: body.favorited }
}

const parseReview = (value: unknown): AddCandidateReviewInput => {
  const body = objectBody(value)
  const decisions = ['shortlist', 'select', 'reject', 'reset'] as const
  if (typeof body.decision !== 'string' || !decisions.includes(body.decision as typeof decisions[number])) throw new Error('评审决定无效')
  const rating = body.rating === undefined ? undefined : Number(body.rating)
  const reasons = Array.isArray(body.reasons) ? body.reasons.filter((item): item is string => typeof item === 'string') : []
  return {
    decision: body.decision as typeof decisions[number],
    ...(rating !== undefined ? { rating } : {}),
    ...(reasons.length ? { reasons } : {}),
    ...(optionalText(body.note) ? { note: optionalText(body.note) } : {}),
    ...(optionalText(body.reviewer) ? { reviewer: optionalText(body.reviewer) } : {}),
    ...(Number.isInteger(body.expectedVersion) ? { expectedVersion: Number(body.expectedVersion) } : {}),
  }
}

const parseComment = (value: unknown): { body: string; author?: string; parentId?: string } => {
  const payload = objectBody(value)
  if (typeof payload.body !== 'string') throw new Error('评论不能为空')
  return {
    body: payload.body,
    ...(optionalText(payload.author) ? { author: optionalText(payload.author) } : {}),
    ...(optionalText(payload.parentId) ? { parentId: optionalText(payload.parentId) } : {}),
  }
}

const requireCollaboration = (repository?: DesignCollaborationRepository): DesignCollaborationRepository => {
  if (!repository?.enabled) throw new Error('设计协作记录暂时不可用')
  return repository
}

export const createDesignApi = (
  service: GenerationService,
  references: SharedReferenceRepository,
  config: DesignApiConfig,
  collaboration?: DesignCollaborationRepository,
) => async (request: Request): Promise<Response> => {
  const url = new URL(request.url)
  const cors = corsHeaders(requestOrigin(request, config.allowedOrigin))
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json({ ok: true, service: 'cookie-amazon-design-service', sharedLibrary: references.enabled, collaboration: collaboration?.enabled ?? false }, 200, cors)
    }
    if (request.method === 'GET' && url.pathname === '/api/references') {
      return json({ references: await references.list() }, 200, cors)
    }
    if (request.method === 'POST' && url.pathname === '/api/references') {
      const reference = await references.create(parseUpload(await request.json()))
      return json({ reference }, 201, cors)
    }
    const imageMatch = /^\/api\/references\/([^/]+)\/image$/.exec(url.pathname)
    if (request.method === 'GET' && imageMatch) {
      const source = await references.getImage(decodeURIComponent(imageMatch[1]))
      const headers = new Headers(cors)
      headers.set('content-type', source.headers.get('content-type') || 'image/jpeg')
      headers.set('cache-control', 'private, max-age=3600')
      return new Response(source.body, { status: 200, headers })
    }
    if (request.method === 'POST' && url.pathname === '/api/generations') {
      const resolved = await resolveGeneration(parseGeneration(await request.json()), references, config.dailyReferenceCount ?? 1)
      const result = await service.generate(resolved.request)
      await Promise.all(resolved.selected.map((reference) => references.markUsed(reference)))
      return json(result, 200, cors)
    }
    if (request.method === 'GET' && url.pathname === '/api/generation-jobs') {
      return json({ jobs: await requireCollaboration(collaboration).listJobs() }, 200, cors)
    }
    if (request.method === 'GET' && url.pathname === '/api/candidates') {
      const status = parseCandidateStatus(url.searchParams.get('status'))
      const actor = optionalText(url.searchParams.get('actor'))
      const favoritesOnly = url.searchParams.get('favorites') === 'true'
      const candidates = await requireCollaboration(collaboration).listCandidates({
        ...(status ? { status } : {}), ...(actor ? { actor } : {}), ...(favoritesOnly && actor ? { favoritedBy: actor } : {}),
      })
      return json({ candidates }, 200, cors)
    }
    const candidateMatch = /^\/api\/candidates\/([^/]+)$/.exec(url.pathname)
    if (request.method === 'GET' && candidateMatch) {
      const candidate = await requireCollaboration(collaboration).getCandidate(decodeURIComponent(candidateMatch[1]), optionalText(url.searchParams.get('actor')))
      return json({ candidate }, 200, cors)
    }
    const favoriteMatch = /^\/api\/candidates\/([^/]+)\/favorite$/.exec(url.pathname)
    if (request.method === 'POST' && favoriteMatch) {
      const input = parseFavorite(await request.json())
      const candidate = await requireCollaboration(collaboration).setFavorite(decodeURIComponent(favoriteMatch[1]), input.actor, input.favorited)
      return json({ candidate }, 200, cors)
    }
    const reviewMatch = /^\/api\/candidates\/([^/]+)\/reviews$/.exec(url.pathname)
    if (request.method === 'POST' && reviewMatch) {
      const candidate = await requireCollaboration(collaboration).addReview(decodeURIComponent(reviewMatch[1]), parseReview(await request.json()))
      return json({ candidate }, 201, cors)
    }
    const commentMatch = /^\/api\/candidates\/([^/]+)\/comments$/.exec(url.pathname)
    if (request.method === 'POST' && commentMatch) {
      const candidate = await requireCollaboration(collaboration).addComment(decodeURIComponent(commentMatch[1]), parseComment(await request.json()))
      return json({ candidate }, 201, cors)
    }
    if (request.method === 'POST' && url.pathname === '/api/daily/run') {
      const raw = await request.json().catch(() => ({})) as unknown
      const jobs = raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as { jobs?: unknown[] }).jobs)
        ? (raw as { jobs: unknown[] }).jobs
        : null
      if (jobs && jobs.length > 20) return json({ error: '单次每日任务最多包含 20 个生成请求' }, 400, cors)
      if (jobs?.length) {
        const results = []
        for (const value of jobs) {
          const resolved = await resolveGeneration(parseGeneration(value), references, config.dailyReferenceCount ?? 1)
          results.push(await service.generate({ ...resolved.request, source: 'scheduled' }))
          await Promise.all(resolved.selected.map((reference) => references.markUsed(reference)))
        }
        return json({ status: 'completed', total: results.length, results }, 200, cors)
      }
      const selected = await references.selectForDaily(config.dailyReferenceCount ?? 1)
      const result = await service.generate({
        source: 'scheduled',
        referenceImages: await Promise.all(selected.map((reference) => references.getDataUrl(reference.id))),
        references: selected.map((reference) => ({ referenceId: reference.id, selectionMode: 'automatic' })),
      })
      await Promise.all(selected.map((reference) => references.markUsed(reference)))
      return json({ status: 'completed', total: 1, references: selected, results: [result] }, 200, cors)
    }
    return json({ error: 'NOT_FOUND' }, 404, cors)
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器处理失败'
    const status = /已被其他成员更新/.test(message) ? 409
      : /不存在/.test(message) ? 404
        : /不能为空|必须|最多|至少|未配置|还没有|有效|无效|不能超过/.test(message) ? 400
          : /暂时不可用/.test(message) ? 503 : 502
    return json({ status: 'failed', error: message }, status, cors)
  }
}