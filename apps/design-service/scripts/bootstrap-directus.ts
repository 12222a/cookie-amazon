export {}

type Field = { field: string; type: string; meta?: Record<string, unknown>; schema?: Record<string, unknown> }
type Collection = { collection: string; meta: Record<string, unknown>; schema: Record<string, unknown>; fields: Field[] }

const url = (process.env.DIRECTUS_URL || 'http://localhost:8055').replace(/\/+$/, '')
const token = process.env.DIRECTUS_TOKEN || ''
if (!token) throw new Error('请先设置 DIRECTUS_TOKEN，再执行 Directus 初始化')

const request = async (path: string, init: RequestInit = {}): Promise<Response> => fetch(`${url}${path}`, {
  ...init,
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...init.headers },
})

const collections: Collection[] = [
  {
    collection: 'fashion_references', meta: { icon: 'checkroom', note: '服饰生成参考图片' }, schema: {},
    fields: [
      { field: 'title', type: 'string' }, { field: 'category', type: 'string' },
      { field: 'source_image', type: 'uuid', meta: { interface: 'file-image', special: ['file'] } },
      { field: 'source_url', type: 'string' }, { field: 'style_tags', type: 'json' },
      { field: 'uploaded_by', type: 'string' },
      { field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], hidden: true } },
      { field: 'status', type: 'string', schema: { default_value: 'active' } },
      { field: 'used_count', type: 'integer', schema: { default_value: 0 } },
      { field: 'last_used_at', type: 'timestamp' },
    ],
  },
  {
    collection: 'design_prompts', meta: { icon: 'edit_note', note: '服饰提示词模板' }, schema: {},
    fields: [
      { field: 'name', type: 'string' }, { field: 'category', type: 'string' },
      { field: 'prompt_template', type: 'text' }, { field: 'negative_prompt', type: 'text' },
      { field: 'provider', type: 'string' }, { field: 'model', type: 'string' },
      { field: 'aspect_ratio', type: 'string' }, { field: 'quality', type: 'string' },
      { field: 'output_count', type: 'integer', schema: { default_value: 2 } },
      { field: 'enabled', type: 'boolean', schema: { default_value: true } },
    ],
  },
  {
    collection: 'generation_jobs', meta: { icon: 'auto_awesome', note: '图片生成任务' }, schema: {},
    fields: [
      { field: 'status', type: 'string', schema: { default_value: 'queued' } },
      { field: 'source', type: 'string', schema: { default_value: 'manual' } },
      { field: 'requested_by', type: 'string' },
      { field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], hidden: true } },
      { field: 'retry_of_job', type: 'uuid' },
      { field: 'prompt', type: 'text' }, { field: 'negative_prompt', type: 'text' },
      { field: 'provider', type: 'string' }, { field: 'model', type: 'string' },
      { field: 'reference_images', type: 'json' }, { field: 'provider_job_id', type: 'string' },
      { field: 'scheduled_for', type: 'timestamp' }, { field: 'started_at', type: 'timestamp' },
      { field: 'finished_at', type: 'timestamp' }, { field: 'error_message', type: 'text' },
    ],
  },
  {
    collection: 'generation_job_references', meta: { icon: 'account_tree', note: '生成任务实际使用的参考图' }, schema: {},
    fields: [
      { field: 'job', type: 'uuid' }, { field: 'reference', type: 'uuid' },
      { field: 'selection_mode', type: 'string' },
    ],
  },
  {
    collection: 'design_candidates', meta: { icon: 'imagesmode', note: '可评审的服饰候选设计' }, schema: {},
    fields: [
      { field: 'job', type: 'uuid' }, { field: 'image_url', type: 'text' },
      { field: 'status', type: 'string', schema: { default_value: 'pending_review' } },
      { field: 'version', type: 'integer', schema: { default_value: 1 } },
      { field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], hidden: true } },
      { field: 'selected_by', type: 'string' }, { field: 'selected_at', type: 'timestamp' },
      { field: 'rejected_by', type: 'string' }, { field: 'rejected_at', type: 'timestamp' },
    ],
  },
  {
    collection: 'candidate_favorites', meta: { icon: 'favorite', note: '成员个人候选收藏' }, schema: {},
    fields: [
      { field: 'candidate', type: 'uuid' }, { field: 'actor', type: 'string' },
      { field: 'active', type: 'boolean', schema: { default_value: true } },
      { field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], hidden: true } },
    ],
  },
  {
    collection: 'candidate_reviews', meta: { icon: 'fact_check', note: '候选评审决策历史' }, schema: {},
    fields: [
      { field: 'candidate', type: 'uuid' }, { field: 'decision', type: 'string' },
      { field: 'status', type: 'string' }, { field: 'rating', type: 'integer' },
      { field: 'reasons', type: 'json' }, { field: 'note', type: 'text' }, { field: 'reviewer', type: 'string' },
      { field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], hidden: true } },
    ],
  },
  {
    collection: 'candidate_comments', meta: { icon: 'comment', note: '候选设计协作评论' }, schema: {},
    fields: [
      { field: 'candidate', type: 'uuid' }, { field: 'body', type: 'text' },
      { field: 'author', type: 'string' }, { field: 'parent', type: 'uuid' },
      { field: 'date_created', type: 'timestamp', meta: { special: ['date-created'], hidden: true } },
    ],
  },
  {
    collection: 'generated_designs', meta: { icon: 'image', note: '服饰生成结果' }, schema: {},
    fields: [
      { field: 'job', type: 'uuid' }, { field: 'generated_image', type: 'uuid', meta: { interface: 'file-image' } },
      { field: 'provider_image_url', type: 'string' },
      { field: 'review_status', type: 'string', schema: { default_value: 'pending' } },
      { field: 'similarity_score', type: 'float' }, { field: 'review_notes', type: 'text' },
      { field: 'selected', type: 'boolean', schema: { default_value: false } },
    ],
  },
]

const existingResponse = await request('/collections?limit=-1')
if (!existingResponse.ok) throw new Error(`读取 Directus 集合失败：HTTP ${existingResponse.status}`)
const existing = new Set(((await existingResponse.json()) as { data: Array<{ collection: string }> }).data.map((item) => item.collection))

for (const definition of collections) {
  if (!existing.has(definition.collection)) {
    const created = await request('/collections', { method: 'POST', body: JSON.stringify(definition) })
    if (!created.ok) throw new Error(`创建 ${definition.collection} 失败：${await created.text()}`)
    console.info(`Created Directus collection: ${definition.collection}`)
  } else {
    console.info(`Directus collection already exists: ${definition.collection}`)
    const fieldsResponse = await request(`/fields/${encodeURIComponent(definition.collection)}`)
    if (!fieldsResponse.ok) throw new Error(`读取 ${definition.collection} 字段失败：HTTP ${fieldsResponse.status}`)
    const existingFields = new Set(((await fieldsResponse.json()) as { data: Array<{ field: string }> }).data.map((item) => item.field))
    for (const field of definition.fields) {
      if (existingFields.has(field.field)) continue
      const createdField = await request(`/fields/${encodeURIComponent(definition.collection)}`, {
        method: 'POST', body: JSON.stringify(field),
      })
      if (!createdField.ok) throw new Error(`创建 ${definition.collection}.${field.field} 失败：${await createdField.text()}`)
      console.info(`Created Directus field: ${definition.collection}.${field.field}`)
    }
  }
}