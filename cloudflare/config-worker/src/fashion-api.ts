import { createProviderRegistry } from '@cookie-amazon/image-generation'

export interface FashionEnv {
  FASHION_DB: D1Database
  FASHION_IMAGES?: R2Bucket
  IMAGE_API_BASE_URL?: string
  IMAGE_API_KEY?: string
  IMAGE_MODEL?: string
  VISION_API_BASE_URL?: string
  VISION_API_KEY?: string
  VISION_MODEL?: string
  IMAGE_OUTPUT_COUNT?: string
  DAILY_REFERENCE_COUNT?: string
}

type CandidateStatus = 'pending_review' | 'shortlisted' | 'selected' | 'rejected' | 'archived'
type ReferenceRow = {
  id: string; title: string; category: string; uploaded_by: string; uploaded_at: string
  used_count: number; last_used_at: string | null; object_key: string; mime_type: string
}
type JobRow = {
  id: string; status: string; source: string; requested_by: string; requested_at: string
  started_at: string | null; finished_at: string | null; prompt: string | null
  error_message: string | null; provider_job_id: string | null; retry_of_job_id: string | null
}
type CandidateRow = {
  id: string; job_id: string; object_key: string; mime_type: string; status: CandidateStatus
  version: number; created_at: string; selected_by: string | null; selected_at: string | null
  rejected_by: string | null; rejected_at: string | null
}
type ScheduleRow = {
  id: string; enabled: number; interval_minutes: number; batch_count: number; next_run_at: string | null
  updated_by: string; updated_at: string
}

const ADMIN_ACTOR = '管理员'
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})
const now = (): string => new Date().toISOString()
const id = (): string => crypto.randomUUID()
const cleanActor = (value: unknown): string => typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : '当前成员'
const requiredText = (value: unknown, label: string, max: number): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空`)
  if (value.trim().length > max) throw new Error(`${label}不能超过 ${max} 个字符`)
  return value.trim()
}
const objectBody = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请求体必须是 JSON 对象')
  return value as Record<string, unknown>
}
const optionalText = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined
const requireAdmin = (actor: unknown): void => {
  if (cleanActor(actor) !== ADMIN_ACTOR) throw new Error('需要管理员权限')
}
const scheduleJson = (row: ScheduleRow) => ({
  enabled: Boolean(row.enabled), intervalMinutes: Number(row.interval_minutes), batchCount: Number(row.batch_count),
  nextRunAt: row.next_run_at, updatedBy: row.updated_by, updatedAt: row.updated_at,
})
const decodeDataUrl = (value: unknown): { mimeType: string; bytes: Uint8Array; extension: string } => {
  if (typeof value !== 'string') throw new Error('图片内容不能为空')
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(value)
  if (!match) throw new Error('共享图片必须是 PNG、JPEG 或 WEBP 格式')
  const binary = atob(match[2])
  if (!binary.length || binary.length > 10 * 1024 * 1024) throw new Error('共享图片不能为空且单张不能超过 10MB')
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const mimeType = match[1].toLowerCase()
  return { mimeType, bytes, extension: mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg' }
}

const referenceJson = (row: ReferenceRow) => ({
  id: row.id,
  title: row.title,
  category: row.category,
  uploadedBy: row.uploaded_by,
  uploadedAt: row.uploaded_at,
  usedCount: Number(row.used_count),
  ...(row.last_used_at ? { lastUsedAt: row.last_used_at } : {}),
  imageUrl: `/api/references/${encodeURIComponent(row.id)}/image`,
})

const listReferenceRows = async (env: FashionEnv): Promise<ReferenceRow[]> => {
  const result = await env.FASHION_DB.prepare(`SELECT id,title,category,uploaded_by,uploaded_at,used_count,last_used_at,object_key,mime_type
    FROM fashion_references WHERE status='active' ORDER BY uploaded_at DESC LIMIT 100`).all<ReferenceRow>()
  return result.results
}

const getReference = async (env: FashionEnv, referenceId: string): Promise<ReferenceRow> => {
  const row = await env.FASHION_DB.prepare(`SELECT id,title,category,uploaded_by,uploaded_at,used_count,last_used_at,object_key,mime_type
    FROM fashion_references WHERE id=? AND status='active'`).bind(referenceId).first<ReferenceRow>()
  if (!row) throw new Error('共享参考图不存在或已停用')
  return row
}

const requireImages = (env: FashionEnv): R2Bucket => {
  if (!env.FASHION_IMAGES) throw new Error('图片存储暂时不可用')
  return env.FASHION_IMAGES
}

const objectDataUrl = async (bucket: R2Bucket, key: string, mimeType: string): Promise<string> => {
  const object = await bucket.get(key)
  if (!object) throw new Error('共享参考图不存在或已停用')
  const bytes = new Uint8Array(await object.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:${mimeType};base64,${btoa(binary)}`
}

const hydrateCandidate = async (env: FashionEnv, row: CandidateRow) => {
  const references = await env.FASHION_DB.prepare(`SELECT reference_id FROM generation_job_references WHERE job_id=? ORDER BY rowid`)
    .bind(row.job_id).all<{ reference_id: string }>()
  return {
    id: row.id,
    jobId: row.job_id,
    imageUrl: `/api/candidates/${encodeURIComponent(row.id)}/image`,
    status: row.status,
    version: Number(row.version),
    createdAt: row.created_at,
    referenceIds: references.results.map((item) => item.reference_id),
  }
}

const getCandidateRow = async (env: FashionEnv, candidateId: string): Promise<CandidateRow> => {
  const row = await env.FASHION_DB.prepare(`SELECT id,job_id,object_key,mime_type,status,version,created_at,selected_by,selected_at,rejected_by,rejected_at
    FROM design_candidates WHERE id=?`).bind(candidateId).first<CandidateRow>()
  if (!row) throw new Error('候选设计不存在')
  return row
}

const errorResponse = (error: unknown): Response => {
  const message = error instanceof Error ? error.message : '服务器处理失败'
  console.error('Fashion API request failed', error)
  const status = /需要管理员权限/.test(message) ? 403
    : /已被其他成员更新/.test(message) ? 409
    : /不存在/.test(message) ? 404
      : /不能为空|必须|最多|至少|有效|无效|不能超过|格式|评分/.test(message) ? 400
        : /暂时不可用|尚未配置/.test(message) ? 503 : 502
  const publicMessage = status === 502 ? '业务处理暂未完成，请稍后重试' : message
  return json({ status: 'failed', error: publicMessage }, status)
}

const promptEndpoint = (baseUrl: string): string => {
  const base = baseUrl.replace(/\/+$/, '').replace(/\/v1\/(?:chat\/completions|images\/(?:generations|edits))$/i, '')
  return `${base.replace(/\/v1$/i, '')}/v1/chat/completions`
}
const SYSTEM_PROMPT = `你是资深服装设计师和跨境电商服饰视觉总监。分析参考图中的服饰品类、轮廓、领口、袖型、肩部、腰线、裙摆、长度、材质、颜色、图案、装饰和场景。输出一条中文图片生成提示词：保持大品类和场景，但主动改变多数设计元素，形成明显不同且不包含品牌标志的新款；输出完整正面服饰效果图、纯净浅色背景、真实面料质感。只输出最终提示词。`
const NEGATIVE_PROMPT = '品牌标志，文字，水印，复制参考图图案，复刻原图独特剪裁，人体畸形，多余肢体，服装结构错误，低清晰度'

const composePrompt = async (env: FashionEnv, referenceImages: string[]): Promise<{ prompt: string; negativePrompt: string }> => {
  const baseUrl = env.VISION_API_BASE_URL || env.IMAGE_API_BASE_URL
  const apiKey = env.VISION_API_KEY || env.IMAGE_API_KEY
  if (!baseUrl || !apiKey) throw new Error('图片生成服务尚未配置')
  const response = await fetch(promptEndpoint(baseUrl), {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.VISION_MODEL || 'gpt-4.1-mini', temperature: 0.4, max_tokens: 1200,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: [
          { type: 'text', text: '分析这些参考服饰图片，并生成同品类但明显不同款式的最终图片生成提示词。' },
          ...referenceImages.map((url) => ({ type: 'image_url', image_url: { url } })),
        ] },
      ],
    }),
  })
  if (!response.ok) throw new Error('图片生成服务暂时不可用')
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> }
  const raw = payload.choices?.[0]?.message?.content
  const prompt = typeof raw === 'string' ? raw.trim() : Array.isArray(raw)
    ? raw.flatMap((part) => part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? [(part as { text: string }).text] : []).join('\n').trim()
    : ''
  if (!prompt) throw new Error('图片生成服务暂时不可用')
  return { prompt, negativePrompt: NEGATIVE_PROMPT }
}

const imageBytes = async (source: string): Promise<{ bytes: ArrayBuffer | Uint8Array; mimeType: string; extension: string }> => {
  if (source.startsWith('data:')) {
    const decoded = decodeDataUrl(source)
    return decoded
  }
  const response = await fetch(source)
  if (!response.ok) throw new Error('生成图片保存失败')
  const mimeType = (response.headers.get('content-type') || 'image/png').split(';')[0].toLowerCase()
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw new Error('生成图片格式无效')
  return { bytes: await response.arrayBuffer(), mimeType, extension: mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1] }
}

const generate = async (request: Request, env: FashionEnv): Promise<Response> => {
  const bucket = requireImages(env)
  if (!env.IMAGE_API_BASE_URL || !env.IMAGE_API_KEY) throw new Error('图片生成服务尚未配置')
  const body = objectBody(await request.json())
  const suppliedIds = Array.isArray(body.referenceIds)
    ? body.referenceIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).slice(0, 4)
    : []
  const automatic = body.autoSelectReferences === true || suppliedIds.length === 0
  let references: ReferenceRow[]
  if (automatic) {
    const limit = Math.max(1, Math.min(4, Math.floor(Number(env.DAILY_REFERENCE_COUNT || 1))))
    references = (await env.FASHION_DB.prepare(`SELECT id,title,category,uploaded_by,uploaded_at,used_count,last_used_at,object_key,mime_type
      FROM fashion_references WHERE status='active' ORDER BY used_count,last_used_at,uploaded_at LIMIT ?`).bind(limit).all<ReferenceRow>()).results
  } else {
    references = await Promise.all(suppliedIds.map((referenceId) => getReference(env, referenceId)))
  }
  if (!references.length) throw new Error('共享图库中还没有可用于生成的裙装图片')

  const jobId = id()
  const timestamp = now()
  const requestedBy = cleanActor(body.requestedBy)
  await env.FASHION_DB.prepare(`INSERT INTO generation_jobs(id,status,source,requested_by,requested_at,started_at)
    VALUES(?,?,?,?,?,?)`).bind(jobId, 'analyzing', 'manual', requestedBy, timestamp, timestamp).run()
  await env.FASHION_DB.batch(references.map((reference) => env.FASHION_DB.prepare(`INSERT INTO generation_job_references(id,job_id,reference_id,selection_mode)
    VALUES(?,?,?,?)`).bind(id(), jobId, reference.id, automatic ? 'automatic' : 'manual')))

  try {
    const referenceImages = await Promise.all(references.map((reference) => objectDataUrl(bucket, reference.object_key, reference.mime_type)))
    const composition = await composePrompt(env, referenceImages)
    await env.FASHION_DB.prepare(`UPDATE generation_jobs SET status='generating',prompt=? WHERE id=?`).bind(composition.prompt, jobId).run()
    const registry = createProviderRegistry({ baseUrl: env.IMAGE_API_BASE_URL, apiKey: env.IMAGE_API_KEY, model: env.IMAGE_MODEL })
    const result = await registry.resolve('openai-compatible').create({
      prompt: composition.prompt,
      negativePrompt: composition.negativePrompt,
      aspectRatio: '2:3', quality: 'medium', count: Math.max(1, Math.min(4, Number(body.outputCount ?? env.IMAGE_OUTPUT_COUNT ?? 2))),
      referenceImages,
    })
    const candidates = []
    for (const source of result.images ?? []) {
      const candidateId = id()
      const image = await imageBytes(source)
      const objectKey = `candidates/${candidateId}.${image.extension}`
      await bucket.put(objectKey, image.bytes, { httpMetadata: { contentType: image.mimeType } })
      await env.FASHION_DB.prepare(`INSERT INTO design_candidates(id,job_id,object_key,mime_type,status,version,created_at)
        VALUES(?,?,?,?,?,?,?)`).bind(candidateId, jobId, objectKey, image.mimeType, 'pending_review', 1, now()).run()
      candidates.push(await hydrateCandidate(env, await getCandidateRow(env, candidateId)))
    }
    const finishedAt = now()
    await env.FASHION_DB.batch([
      env.FASHION_DB.prepare(`UPDATE generation_jobs SET status='succeeded',provider_job_id=?,finished_at=? WHERE id=?`)
        .bind(result.providerJobId || null, finishedAt, jobId),
      ...references.map((reference) => env.FASHION_DB.prepare(`UPDATE fashion_references SET used_count=used_count+1,last_used_at=? WHERE id=?`)
        .bind(finishedAt, reference.id)),
    ])
    return json({ status: 'succeeded', jobId, images: candidates.map((candidate) => candidate.imageUrl), candidates, composedPrompt: composition.prompt })
  } catch (error) {
    const internalMessage = error instanceof Error ? error.message : '生成失败'
    await env.FASHION_DB.prepare(`UPDATE generation_jobs SET status='failed',error_message=?,finished_at=? WHERE id=?`)
      .bind(internalMessage, now(), jobId).run()
    throw error
  }
}

export const runScheduledGeneration = async (env: FashionEnv): Promise<void> => {
  const schedule = await env.FASHION_DB.prepare(`SELECT id,enabled,interval_minutes,batch_count,next_run_at,updated_by,updated_at
    FROM generation_schedule WHERE id='default'`).first<ScheduleRow>()
  if (!schedule?.enabled || !schedule.next_run_at || schedule.next_run_at > now()) return
  const startedAt = new Date()
  const nextRunAt = new Date(startedAt.getTime() + Number(schedule.interval_minutes) * 60_000).toISOString()
  const locked = await env.FASHION_DB.prepare(`UPDATE generation_schedule SET next_run_at=?,updated_at=?
    WHERE id='default' AND enabled=1 AND next_run_at=?`).bind(nextRunAt, startedAt.toISOString(), schedule.next_run_at).run()
  if (!locked.meta.changes) return
  const request = new Request('https://internal/api/generations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ autoSelectReferences: true, requestedBy: '定时任务', outputCount: schedule.batch_count }),
  })
  const response = await generate(request, env)
  if (!response.ok) console.error('Scheduled fashion generation failed', await response.text())
}

const jobJson = async (env: FashionEnv, row: JobRow) => {
  const [references, candidates] = await Promise.all([
    env.FASHION_DB.prepare(`SELECT reference_id FROM generation_job_references WHERE job_id=? ORDER BY rowid`).bind(row.id).all<{ reference_id: string }>(),
    env.FASHION_DB.prepare(`SELECT COUNT(*) AS count FROM design_candidates WHERE job_id=?`).bind(row.id).first<{ count: number }>(),
  ])
  return {
    id: row.id, status: row.status, source: row.source, requestedBy: row.requested_by, requestedAt: row.requested_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}), ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
    ...(row.prompt ? { prompt: row.prompt } : {}), ...(row.error_message ? { error: row.error_message } : {}),
    ...(row.provider_job_id ? { providerJobId: row.provider_job_id } : {}), ...(row.retry_of_job_id ? { retryOfJobId: row.retry_of_job_id } : {}),
    referenceIds: references.results.map((item) => item.reference_id), candidateCount: Number(candidates?.count || 0),
  }
}

export const isFashionApiPath = (pathname: string): boolean =>
  pathname === '/api/references' || pathname === '/api/generations' || pathname === '/api/generation-jobs'
  || pathname === '/api/candidates' || pathname === '/api/daily/run' || pathname === '/api/admin/schedule'
  || /^\/api\/references\/[^/]+(?:\/image)?$/.test(pathname)
  || /^\/api\/candidates\/[^/]+(?:\/image)?$/.test(pathname)

export const handleFashionApi = async (request: Request, env: FashionEnv): Promise<Response> => {
  const url = new URL(request.url)
  try {
    if (request.method === 'GET' && url.pathname === '/api/admin/schedule') {
      requireAdmin(url.searchParams.get('actor'))
      const row = await env.FASHION_DB.prepare(`SELECT id,enabled,interval_minutes,batch_count,next_run_at,updated_by,updated_at
        FROM generation_schedule WHERE id='default'`).first<ScheduleRow>()
      if (!row) throw new Error('定时生成配置不存在')
      return json({ schedule: scheduleJson(row) })
    }
    if (request.method === 'PUT' && url.pathname === '/api/admin/schedule') {
      const body = objectBody(await request.json())
      requireAdmin(body.actor)
      if (typeof body.enabled !== 'boolean') throw new Error('启用状态必须是布尔值')
      const intervalMinutes = Number(body.intervalMinutes)
      const batchCount = Number(body.batchCount)
      if (!Number.isInteger(intervalMinutes) || intervalMinutes < 60 || intervalMinutes > 10080) throw new Error('生成间隔必须是 1 小时到 7 天')
      if (!Number.isInteger(batchCount) || batchCount < 1 || batchCount > 4) throw new Error('每次生成数量必须是 1 到 4')
      const updatedAt = now()
      const nextRunAt = body.enabled ? new Date(Date.now() + intervalMinutes * 60_000).toISOString() : null
      await env.FASHION_DB.prepare(`INSERT INTO generation_schedule(id,enabled,interval_minutes,batch_count,next_run_at,updated_by,updated_at)
        VALUES('default',?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,interval_minutes=excluded.interval_minutes,
        batch_count=excluded.batch_count,next_run_at=excluded.next_run_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
        .bind(body.enabled ? 1 : 0, intervalMinutes, batchCount, nextRunAt, ADMIN_ACTOR, updatedAt).run()
      const row = await env.FASHION_DB.prepare(`SELECT id,enabled,interval_minutes,batch_count,next_run_at,updated_by,updated_at
        FROM generation_schedule WHERE id='default'`).first<ScheduleRow>()
      return json({ schedule: scheduleJson(row as ScheduleRow) })
    }
    if (request.method === 'GET' && url.pathname === '/api/references') return json({ references: (await listReferenceRows(env)).map(referenceJson) })
    if (request.method === 'POST' && url.pathname === '/api/references') {
      const bucket = requireImages(env)
      const body = objectBody(await request.json())
      const filename = requiredText(body.filename, '图片文件名', 255)
      const image = decodeDataUrl(body.dataUrl)
      const referenceId = id()
      const objectKey = `references/${referenceId}.${image.extension}`
      const uploadedAt = now()
      await bucket.put(objectKey, image.bytes, { httpMetadata: { contentType: image.mimeType } })
      await env.FASHION_DB.prepare(`INSERT INTO fashion_references
        (id,title,category,uploaded_by,uploaded_at,used_count,object_key,mime_type,status) VALUES(?,?,?,?,?,?,?,?,?)`)
        .bind(referenceId, optionalText(body.title) || filename, '女士裙装', cleanActor(body.uploadedBy), uploadedAt, 0, objectKey, image.mimeType, 'active').run()
      return json({ reference: referenceJson(await getReference(env, referenceId)) }, 201)
    }
    const reference = /^\/api\/references\/([^/]+)$/.exec(url.pathname)
    if (request.method === 'DELETE' && reference) {
      const referenceId = decodeURIComponent(reference[1])
      const row = await getReference(env, referenceId)
      await requireImages(env).delete(row.object_key)
      await env.FASHION_DB.prepare(`UPDATE fashion_references SET status='deleted' WHERE id=?`).bind(referenceId).run()
      return json({ deleted: true, referenceId })
    }
    const referenceImage = /^\/api\/references\/([^/]+)\/image$/.exec(url.pathname)
    if (request.method === 'GET' && referenceImage) {
      const row = await getReference(env, decodeURIComponent(referenceImage[1]))
      const object = await requireImages(env).get(row.object_key)
      if (!object) throw new Error('共享参考图不存在或已停用')
      return new Response(object.body, { headers: { 'content-type': row.mime_type, 'cache-control': 'public, max-age=3600', etag: object.httpEtag } })
    }
    if (request.method === 'POST' && url.pathname === '/api/generations') return await generate(request, env)
    if (request.method === 'GET' && url.pathname === '/api/generation-jobs') {
      const rows = (await env.FASHION_DB.prepare(`SELECT id,status,source,requested_by,requested_at,started_at,finished_at,prompt,error_message,provider_job_id,retry_of_job_id
        FROM generation_jobs ORDER BY requested_at DESC LIMIT 200`).all<JobRow>()).results
      return json({ jobs: await Promise.all(rows.map((row) => jobJson(env, row))) })
    }
    if (request.method === 'GET' && url.pathname === '/api/candidates') {
      const allowed: CandidateStatus[] = ['pending_review', 'shortlisted', 'selected', 'rejected', 'archived']
      const status = url.searchParams.get('status')
      if (status && !allowed.includes(status as CandidateStatus)) throw new Error('候选状态无效')
      const rows = status
        ? (await env.FASHION_DB.prepare(`SELECT id,job_id,object_key,mime_type,status,version,created_at,selected_by,selected_at,rejected_by,rejected_at
          FROM design_candidates WHERE status=? ORDER BY created_at DESC LIMIT 100`).bind(status).all<CandidateRow>()).results
        : (await env.FASHION_DB.prepare(`SELECT id,job_id,object_key,mime_type,status,version,created_at,selected_by,selected_at,rejected_by,rejected_at
          FROM design_candidates ORDER BY created_at DESC LIMIT 100`).all<CandidateRow>()).results
      return json({ candidates: await Promise.all(rows.map((row) => hydrateCandidate(env, row))) })
    }
    const candidate = /^\/api\/candidates\/([^/]+)$/.exec(url.pathname)
    if (request.method === 'GET' && candidate) {
      return json({ candidate: await hydrateCandidate(env, await getCandidateRow(env, decodeURIComponent(candidate[1]))) })
    }
    const candidateImage = /^\/api\/candidates\/([^/]+)\/image$/.exec(url.pathname)
    if (request.method === 'GET' && candidateImage) {
      const row = await getCandidateRow(env, decodeURIComponent(candidateImage[1]))
      const object = await requireImages(env).get(row.object_key)
      if (!object) throw new Error('候选设计不存在')
      return new Response(object.body, { headers: { 'content-type': row.mime_type, 'cache-control': 'public, max-age=3600', etag: object.httpEtag } })
    }
    if (request.method === 'POST' && url.pathname === '/api/daily/run') return json({ status: 'disabled', error: '每日自动生成尚未启用' }, 503)
    return json({ error: 'NOT_FOUND' }, 404)
  } catch (error) {
    return errorResponse(error)
  }
}