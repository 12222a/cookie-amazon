import { createServer } from 'node:http'
import { createProviderRegistry } from '@cookie-amazon/image-generation'
import { createDesignApi } from './api'
import { createDirectusDesignCollaborationRepository, createLocalDesignCollaborationRepository } from './collaboration-repository'
import { createDirectusClient } from './directus-client'
import { createGenerationService } from './generation-service'
import { createOpenAICompatiblePromptComposer } from './multimodal-prompt'
import { createLocalSharedReferenceRepository, createSharedReferenceRepository } from './reference-repository'

const port = Number(process.env.DESIGN_SERVICE_PORT || 8788)
const registry = createProviderRegistry({
  baseUrl: process.env.IMAGE_API_BASE_URL || '',
  apiKey: process.env.IMAGE_API_KEY || '',
  model: process.env.IMAGE_MODEL,
})
const directus = createDirectusClient({ url: process.env.DIRECTUS_URL, token: process.env.DIRECTUS_TOKEN })
const promptComposer = createOpenAICompatiblePromptComposer({
  baseUrl: process.env.VISION_API_BASE_URL || process.env.IMAGE_API_BASE_URL || '',
  apiKey: process.env.VISION_API_KEY || process.env.IMAGE_API_KEY || '',
  model: process.env.VISION_MODEL,
})
const references = directus.enabled
  ? createSharedReferenceRepository(directus)
  : createLocalSharedReferenceRepository(process.env.REFERENCE_STORAGE_DIR)
const collaboration = directus.enabled
  ? createDirectusDesignCollaborationRepository(directus)
  : createLocalDesignCollaborationRepository(process.env.COLLABORATION_STORAGE_DIR)
const generationService = createGenerationService(registry, directus, promptComposer, {
  provider: process.env.IMAGE_PROVIDER || 'litellm',
  aspectRatio: process.env.IMAGE_ASPECT_RATIO || '2:3',
  quality: process.env.IMAGE_QUALITY || 'medium',
  count: Number(process.env.IMAGE_OUTPUT_COUNT || 2),
}, collaboration)
const api = createDesignApi(generationService, references, {
  allowedOrigin: process.env.DESIGN_SERVICE_ALLOWED_ORIGIN || 'http://localhost:5173',
  dailyReferenceCount: Number(process.env.DAILY_REFERENCE_COUNT || 1),
}, collaboration)

const server = createServer(async (incoming, outgoing) => {
  const chunks: Buffer[] = []
  for await (const chunk of incoming) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const body = Buffer.concat(chunks)
  const request = new Request(`http://${incoming.headers.host || `localhost:${port}`}${incoming.url || '/'}`, {
    method: incoming.method,
    headers: incoming.headers as HeadersInit,
    body: ['GET', 'HEAD'].includes(incoming.method || 'GET') ? undefined : body,
  })
  const response = await api(request)
  outgoing.statusCode = response.status
  response.headers.forEach((value, key) => outgoing.setHeader(key, value))
  outgoing.end(Buffer.from(await response.arrayBuffer()))
})

server.listen(port, '0.0.0.0', () => {
  console.info(`Cookie Amazon design service started at http://localhost:${port}`)
  console.info(`Shared reference storage: ${directus.enabled ? 'Directus' : 'local server directory'}`)
  console.info(`Design collaboration storage: ${directus.enabled ? 'Directus' : 'local server directory'}`)
})