import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DirectusClient } from './directus-client'

export type GenerationJobStatus = 'queued' | 'analyzing' | 'generating' | 'succeeded' | 'failed' | 'cancelled'
export type GenerationSource = 'manual' | 'scheduled' | 'retry'
export type ReferenceSelectionMode = 'manual' | 'automatic'
export type CandidateStatus = 'pending_review' | 'shortlisted' | 'selected' | 'rejected' | 'archived'
export type ReviewDecision = 'shortlist' | 'select' | 'reject' | 'reset'

export type GenerationReferenceLink = {
  referenceId: string
  selectionMode: ReferenceSelectionMode
}

export type GenerationJob = {
  id: string
  status: GenerationJobStatus
  source: GenerationSource
  requestedBy: string
  requestedAt: string
  startedAt?: string
  finishedAt?: string
  prompt?: string
  error?: string
  providerJobId?: string
  retryOfJobId?: string
  referenceIds: string[]
  candidateCount: number
}

export type CandidateReview = {
  id: string
  candidateId: string
  decision: ReviewDecision
  status: CandidateStatus
  rating?: number
  reasons: string[]
  note?: string
  reviewer: string
  createdAt: string
}

export type CandidateComment = {
  id: string
  candidateId: string
  body: string
  author: string
  createdAt: string
  parentId?: string
}

export type DesignCandidate = {
  id: string
  jobId: string
  imageUrl: string
  status: CandidateStatus
  version: number
  createdAt: string
  favoriteCount: number
  isFavorited: boolean
  referenceIds: string[]
  reviews: CandidateReview[]
  comments: CandidateComment[]
  selectedBy?: string
  selectedAt?: string
  rejectedBy?: string
  rejectedAt?: string
}

export type CreateGenerationJobInput = {
  source?: GenerationSource
  requestedBy?: string
  requestedAt?: string
  retryOfJobId?: string
  references?: GenerationReferenceLink[]
}

export type CandidateListFilter = {
  status?: CandidateStatus
  favoritedBy?: string
  actor?: string
}

export type AddCandidateReviewInput = {
  decision: ReviewDecision
  rating?: number
  reasons?: string[]
  note?: string
  reviewer?: string
  expectedVersion?: number
}

export type DesignCollaborationRepository = {
  readonly enabled: boolean
  createJob(input: CreateGenerationJobInput): Promise<GenerationJob>
  updateJob(id: string, changes: Partial<Pick<GenerationJob, 'status' | 'startedAt' | 'finishedAt' | 'prompt' | 'error' | 'providerJobId'>>): Promise<GenerationJob>
  createCandidates(jobId: string, imageUrls: string[]): Promise<DesignCandidate[]>
  listJobs(): Promise<GenerationJob[]>
  listCandidates(filter?: CandidateListFilter): Promise<DesignCandidate[]>
  getCandidate(id: string, actor?: string): Promise<DesignCandidate>
  setFavorite(candidateId: string, actor: string, favorited: boolean): Promise<DesignCandidate>
  addReview(candidateId: string, input: AddCandidateReviewInput): Promise<DesignCandidate>
  addComment(candidateId: string, input: { body: string; author?: string; parentId?: string }): Promise<DesignCandidate>
}

type StoredJob = Omit<GenerationJob, 'referenceIds' | 'candidateCount'>
type StoredCandidate = Omit<DesignCandidate, 'favoriteCount' | 'isFavorited' | 'referenceIds' | 'reviews' | 'comments'>
type StoredFavorite = { id: string; candidateId: string; actor: string; active: boolean; createdAt: string }
type LocalStore = {
  jobs: StoredJob[]
  jobReferences: Array<GenerationReferenceLink & { id: string; jobId: string }>
  candidates: StoredCandidate[]
  favorites: StoredFavorite[]
  reviews: CandidateReview[]
  comments: CandidateComment[]
}

const emptyStore = (): LocalStore => ({ jobs: [], jobReferences: [], candidates: [], favorites: [], reviews: [], comments: [] })
const now = (): string => new Date().toISOString()
const cleanActor = (value?: string): string => value?.trim().slice(0, 80) || '当前成员'
const cleanText = (value: string, label: string, max: number): string => {
  const cleaned = value.trim()
  if (!cleaned) throw new Error(`${label}不能为空`)
  if (cleaned.length > max) throw new Error(`${label}不能超过 ${max} 个字符`)
  return cleaned
}
const statusForDecision = (decision: ReviewDecision): CandidateStatus => ({
  shortlist: 'shortlisted', select: 'selected', reject: 'rejected', reset: 'pending_review',
})[decision] as CandidateStatus

const hydrateCandidate = (store: LocalStore, candidate: StoredCandidate, actor?: string): DesignCandidate => {
  const favorites = store.favorites.filter((item) => item.candidateId === candidate.id && item.active)
  return {
    ...candidate,
    favoriteCount: favorites.length,
    isFavorited: actor ? favorites.some((item) => item.actor === actor) : false,
    referenceIds: store.jobReferences.filter((item) => item.jobId === candidate.jobId).map((item) => item.referenceId),
    reviews: store.reviews.filter((item) => item.candidateId === candidate.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    comments: store.comments.filter((item) => item.candidateId === candidate.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }
}

const hydrateJob = (store: LocalStore, job: StoredJob): GenerationJob => ({
  ...job,
  referenceIds: store.jobReferences.filter((item) => item.jobId === job.id).map((item) => item.referenceId),
  candidateCount: store.candidates.filter((item) => item.jobId === job.id).length,
})

export const createLocalDesignCollaborationRepository = (
  storageDirectory = resolve(process.cwd(), 'data', 'fashion-collaboration'),
): DesignCollaborationRepository => {
  const metadataPath = resolve(storageDirectory, 'collaboration.json')
  let writeQueue = Promise.resolve()

  const readStore = async (): Promise<LocalStore> => {
    await mkdir(storageDirectory, { recursive: true })
    try {
      const parsed = JSON.parse(await readFile(metadataPath, 'utf8')) as Partial<LocalStore>
      return {
        jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
        jobReferences: Array.isArray(parsed.jobReferences) ? parsed.jobReferences : [],
        candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
        reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
        comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore()
      throw error
    }
  }
  const mutate = async <T>(change: (store: LocalStore) => T | Promise<T>): Promise<T> => {
    const operation = writeQueue.catch(() => undefined).then(async () => {
      const store = await readStore()
      const result = await change(store)
      await writeFile(metadataPath, JSON.stringify(store, null, 2), 'utf8')
      return result
    })
    writeQueue = operation.then(() => undefined, () => undefined)
    return operation
  }
  const findCandidate = (store: LocalStore, id: string): StoredCandidate => {
    const candidate = store.candidates.find((item) => item.id === id)
    if (!candidate) throw new Error('候选设计不存在')
    return candidate
  }

  return {
    enabled: true,
    async createJob(input) {
      return mutate((store) => {
        const job: StoredJob = {
          id: randomUUID(),
          status: 'queued',
          source: input.source ?? 'manual',
          requestedBy: cleanActor(input.requestedBy),
          requestedAt: input.requestedAt ?? now(),
          ...(input.retryOfJobId ? { retryOfJobId: input.retryOfJobId } : {}),
        }
        store.jobs.push(job)
        for (const reference of input.references ?? []) store.jobReferences.push({ id: randomUUID(), jobId: job.id, ...reference })
        return hydrateJob(store, job)
      })
    },
    async updateJob(id, changes) {
      return mutate((store) => {
        const job = store.jobs.find((item) => item.id === id)
        if (!job) throw new Error('生成任务不存在')
        Object.assign(job, changes)
        return hydrateJob(store, job)
      })
    },
    async createCandidates(jobId, imageUrls) {
      return mutate((store) => {
        if (!store.jobs.some((item) => item.id === jobId)) throw new Error('生成任务不存在')
        const createdAt = now()
        const candidates = imageUrls.map((imageUrl): StoredCandidate => ({
          id: randomUUID(), jobId, imageUrl, status: 'pending_review', version: 1, createdAt,
        }))
        store.candidates.push(...candidates)
        return candidates.map((candidate) => hydrateCandidate(store, candidate))
      })
    },
    async listJobs() {
      const store = await readStore()
      return store.jobs.map((job) => hydrateJob(store, job)).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    },
    async listCandidates(filter = {}) {
      const store = await readStore()
      const candidates = store.candidates
        .filter((candidate) => !filter.status || candidate.status === filter.status)
        .map((candidate) => hydrateCandidate(store, candidate, filter.actor ?? filter.favoritedBy))
        .filter((candidate) => !filter.favoritedBy || candidate.isFavorited)
      return candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async getCandidate(id, actor) {
      const store = await readStore()
      return hydrateCandidate(store, findCandidate(store, id), actor)
    },
    async setFavorite(candidateId, actor, favorited) {
      return mutate((store) => {
        const candidate = findCandidate(store, candidateId)
        const member = cleanActor(actor)
        const existing = store.favorites.find((item) => item.candidateId === candidateId && item.actor === member)
        if (existing) existing.active = favorited
        else store.favorites.push({ id: randomUUID(), candidateId, actor: member, active: favorited, createdAt: now() })
        return hydrateCandidate(store, candidate, member)
      })
    },
    async addReview(candidateId, input) {
      return mutate((store) => {
        const candidate = findCandidate(store, candidateId)
        if (input.expectedVersion !== undefined && input.expectedVersion !== candidate.version) {
          throw new Error('候选设计已被其他成员更新，请刷新后重试')
        }
        if (input.rating !== undefined && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) {
          throw new Error('评分必须是 1 到 5 的整数')
        }
        const reviewer = cleanActor(input.reviewer)
        const createdAt = now()
        const nextStatus = statusForDecision(input.decision)
        const review: CandidateReview = {
          id: randomUUID(), candidateId, decision: input.decision, status: nextStatus,
          ...(input.rating ? { rating: input.rating } : {}),
          reasons: (input.reasons ?? []).map((reason) => cleanText(reason, '评审原因', 80)).slice(0, 8),
          ...(input.note?.trim() ? { note: cleanText(input.note, '评审备注', 1000) } : {}),
          reviewer, createdAt,
        }
        candidate.status = nextStatus
        candidate.version += 1
        delete candidate.selectedBy
        delete candidate.selectedAt
        delete candidate.rejectedBy
        delete candidate.rejectedAt
        if (nextStatus === 'selected') {
          candidate.selectedBy = reviewer
          candidate.selectedAt = createdAt
        }
        if (nextStatus === 'rejected') {
          candidate.rejectedBy = reviewer
          candidate.rejectedAt = createdAt
        }
        store.reviews.push(review)
        return hydrateCandidate(store, candidate, reviewer)
      })
    },
    async addComment(candidateId, input) {
      return mutate((store) => {
        const candidate = findCandidate(store, candidateId)
        if (input.parentId && !store.comments.some((item) => item.id === input.parentId && item.candidateId === candidateId)) {
          throw new Error('回复的评论不存在')
        }
        store.comments.push({
          id: randomUUID(), candidateId, body: cleanText(input.body, '评论', 2000), author: cleanActor(input.author),
          createdAt: now(), ...(input.parentId ? { parentId: input.parentId } : {}),
        })
        return hydrateCandidate(store, candidate, cleanActor(input.author))
      })
    },
  }
}

type DirectusJob = {
  id: string; status: GenerationJobStatus; source?: GenerationSource; requested_by?: string; date_created?: string
  started_at?: string; finished_at?: string; prompt?: string; error_message?: string; provider_job_id?: string; retry_of_job?: string
}
type DirectusJobReference = { id: string; job: string; reference: string; selection_mode: ReferenceSelectionMode }
type DirectusCandidate = {
  id: string; job: string; image_url: string; status: CandidateStatus; version?: number; date_created?: string
  selected_by?: string; selected_at?: string; rejected_by?: string; rejected_at?: string
}
type DirectusFavorite = { id: string; candidate: string; actor: string; active?: boolean; date_created?: string }
type DirectusReview = {
  id: string; candidate: string; decision: ReviewDecision; status: CandidateStatus; rating?: number; reasons?: string[]
  note?: string; reviewer?: string; date_created?: string
}
type DirectusComment = { id: string; candidate: string; body: string; author?: string; date_created?: string; parent?: string }

export const createDirectusDesignCollaborationRepository = (directus: DirectusClient): DesignCollaborationRepository => {
  const required = <T>(value: T | null, message: string): T => {
    if (!value) throw new Error(message)
    return value
  }
  const queryBy = (field: string, value: string): string => `filter[${field}][_eq]=${encodeURIComponent(value)}&limit=500`
  const loadRelated = async () => {
    const [jobs, links, candidates, favorites, reviews, comments] = await Promise.all([
      directus.listItems<DirectusJob>('generation_jobs', 'sort=-date_created&limit=200'),
      directus.listItems<DirectusJobReference>('generation_job_references', 'limit=500'),
      directus.listItems<DirectusCandidate>('design_candidates', 'sort=-date_created&limit=500'),
      directus.listItems<DirectusFavorite>('candidate_favorites', 'limit=1000'),
      directus.listItems<DirectusReview>('candidate_reviews', 'sort=-date_created&limit=1000'),
      directus.listItems<DirectusComment>('candidate_comments', 'sort=date_created&limit=1000'),
    ])
    return { jobs: jobs ?? [], links: links ?? [], candidates: candidates ?? [], favorites: favorites ?? [], reviews: reviews ?? [], comments: comments ?? [] }
  }
  const mapJob = (data: Awaited<ReturnType<typeof loadRelated>>, job: DirectusJob): GenerationJob => ({
    id: job.id, status: job.status, source: job.source ?? 'manual', requestedBy: cleanActor(job.requested_by),
    requestedAt: job.date_created ?? new Date(0).toISOString(), ...(job.started_at ? { startedAt: job.started_at } : {}),
    ...(job.finished_at ? { finishedAt: job.finished_at } : {}), ...(job.prompt ? { prompt: job.prompt } : {}),
    ...(job.error_message ? { error: job.error_message } : {}), ...(job.provider_job_id ? { providerJobId: job.provider_job_id } : {}),
    ...(job.retry_of_job ? { retryOfJobId: job.retry_of_job } : {}),
    referenceIds: data.links.filter((item) => item.job === job.id).map((item) => item.reference),
    candidateCount: data.candidates.filter((item) => item.job === job.id).length,
  })
  const mapCandidate = (data: Awaited<ReturnType<typeof loadRelated>>, candidate: DirectusCandidate, actor?: string): DesignCandidate => {
    const favorites = data.favorites.filter((item) => item.candidate === candidate.id && item.active !== false)
    return {
      id: candidate.id, jobId: candidate.job, imageUrl: candidate.image_url, status: candidate.status,
      version: Math.max(1, Number(candidate.version ?? 1)), createdAt: candidate.date_created ?? new Date(0).toISOString(),
      favoriteCount: favorites.length, isFavorited: actor ? favorites.some((item) => item.actor === actor) : false,
      referenceIds: data.links.filter((item) => item.job === candidate.job).map((item) => item.reference),
      reviews: data.reviews.filter((item) => item.candidate === candidate.id).map((item) => ({
        id: item.id, candidateId: item.candidate, decision: item.decision, status: item.status,
        ...(item.rating ? { rating: item.rating } : {}), reasons: Array.isArray(item.reasons) ? item.reasons : [],
        ...(item.note ? { note: item.note } : {}), reviewer: cleanActor(item.reviewer), createdAt: item.date_created ?? new Date(0).toISOString(),
      })),
      comments: data.comments.filter((item) => item.candidate === candidate.id).map((item) => ({
        id: item.id, candidateId: item.candidate, body: item.body, author: cleanActor(item.author),
        createdAt: item.date_created ?? new Date(0).toISOString(), ...(item.parent ? { parentId: item.parent } : {}),
      })),
      ...(candidate.selected_by ? { selectedBy: candidate.selected_by } : {}), ...(candidate.selected_at ? { selectedAt: candidate.selected_at } : {}),
      ...(candidate.rejected_by ? { rejectedBy: candidate.rejected_by } : {}), ...(candidate.rejected_at ? { rejectedAt: candidate.rejected_at } : {}),
    }
  }
  const getCandidateRecord = async (id: string): Promise<DirectusCandidate> => required(await directus.getItem<DirectusCandidate>('design_candidates', id), '候选设计不存在')

  return {
    enabled: directus.enabled,
    async createJob(input) {
      const record = required(await directus.createItem<DirectusJob>('generation_jobs', {
        status: 'queued', source: input.source ?? 'manual', requested_by: cleanActor(input.requestedBy),
        ...(input.retryOfJobId ? { retry_of_job: input.retryOfJobId } : {}),
      }), '生成任务创建失败')
      await Promise.all((input.references ?? []).map((reference) => directus.createItem('generation_job_references', {
        job: record.id, reference: reference.referenceId, selection_mode: reference.selectionMode,
      })))
      const data = await loadRelated()
      return mapJob(data, record)
    },
    async updateJob(id, changes) {
      const payload = {
        ...(changes.status ? { status: changes.status } : {}), ...(changes.startedAt ? { started_at: changes.startedAt } : {}),
        ...(changes.finishedAt ? { finished_at: changes.finishedAt } : {}), ...(changes.prompt !== undefined ? { prompt: changes.prompt } : {}),
        ...(changes.error !== undefined ? { error_message: changes.error } : {}),
        ...(changes.providerJobId !== undefined ? { provider_job_id: changes.providerJobId } : {}),
      }
      const record = required(await directus.updateItem<DirectusJob>('generation_jobs', id, payload), '生成任务更新失败')
      return mapJob(await loadRelated(), record)
    },
    async createCandidates(jobId, imageUrls) {
      const records = await Promise.all(imageUrls.map((imageUrl) => directus.createItem<DirectusCandidate>('design_candidates', {
        job: jobId, image_url: imageUrl, status: 'pending_review', version: 1,
      })))
      const data = await loadRelated()
      return records.filter((item): item is DirectusCandidate => Boolean(item)).map((item) => mapCandidate(data, item))
    },
    async listJobs() {
      const data = await loadRelated()
      return data.jobs.map((job) => mapJob(data, job))
    },
    async listCandidates(filter = {}) {
      const data = await loadRelated()
      return data.candidates.filter((item) => !filter.status || item.status === filter.status)
        .map((item) => mapCandidate(data, item, filter.actor ?? filter.favoritedBy))
        .filter((item) => !filter.favoritedBy || item.isFavorited)
    },
    async getCandidate(id, actor) {
      const data = await loadRelated()
      const candidate = data.candidates.find((item) => item.id === id)
      if (!candidate) throw new Error('候选设计不存在')
      return mapCandidate(data, candidate, actor)
    },
    async setFavorite(candidateId, actor, favorited) {
      await getCandidateRecord(candidateId)
      const member = cleanActor(actor)
      const records = await directus.listItems<DirectusFavorite>('candidate_favorites', `${queryBy('candidate', candidateId)}&filter[actor][_eq]=${encodeURIComponent(member)}`)
      const existing = records?.find((item) => item.actor === member)
      if (existing) await directus.updateItem('candidate_favorites', existing.id, { active: favorited })
      else await directus.createItem('candidate_favorites', { candidate: candidateId, actor: member, active: favorited })
      return this.getCandidate(candidateId, member)
    },
    async addReview(candidateId, input) {
      const candidate = await getCandidateRecord(candidateId)
      const version = Math.max(1, Number(candidate.version ?? 1))
      if (input.expectedVersion !== undefined && input.expectedVersion !== version) throw new Error('候选设计已被其他成员更新，请刷新后重试')
      if (input.rating !== undefined && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) throw new Error('评分必须是 1 到 5 的整数')
      const reviewer = cleanActor(input.reviewer)
      const status = statusForDecision(input.decision)
      const timestamp = now()
      await directus.createItem('candidate_reviews', {
        candidate: candidateId, decision: input.decision, status, rating: input.rating ?? null,
        reasons: (input.reasons ?? []).map((reason) => cleanText(reason, '评审原因', 80)).slice(0, 8),
        note: input.note?.trim() ? cleanText(input.note, '评审备注', 1000) : null, reviewer,
      })
      await directus.updateItem('design_candidates', candidateId, {
        status, version: version + 1,
        selected_by: status === 'selected' ? reviewer : null, selected_at: status === 'selected' ? timestamp : null,
        rejected_by: status === 'rejected' ? reviewer : null, rejected_at: status === 'rejected' ? timestamp : null,
      })
      return this.getCandidate(candidateId, reviewer)
    },
    async addComment(candidateId, input) {
      await getCandidateRecord(candidateId)
      if (input.parentId) {
        const parent = await directus.getItem<DirectusComment>('candidate_comments', input.parentId)
        if (!parent || parent.candidate !== candidateId) throw new Error('回复的评论不存在')
      }
      const author = cleanActor(input.author)
      await directus.createItem('candidate_comments', {
        candidate: candidateId, body: cleanText(input.body, '评论', 2000), author,
        ...(input.parentId ? { parent: input.parentId } : {}),
      })
      return this.getCandidate(candidateId, author)
    },
  }
}