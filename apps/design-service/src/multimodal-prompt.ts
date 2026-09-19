import { normalizeGenerationParams } from '@cookie-amazon/image-generation'

export type PromptComposerInput = {
  referenceImages: string[]
}

export type PromptComposition = {
  prompt: string
  negativePrompt: string
}

export type PromptComposer = {
  compose(input: PromptComposerInput): Promise<PromptComposition>
}

export type PromptComposerConfig = {
  baseUrl: string
  apiKey: string
  model?: string
  fetch?: typeof globalThis.fetch
}

const SYSTEM_PROMPT = `你是资深服装设计师和跨境电商服饰视觉总监。请分析用户提供的服饰参考图，识别服饰品类、整体轮廓、领口、袖型、肩部、腰线、裙摆、长度、材质、颜色、图案、装饰和穿着场景。

基于识别结果编写一条可直接交给图片生成模型的中文提示词。要求：
1. 保持参考图的服饰大品类和适用场景，但生成一个明显不同的新款式；
2. 必须主动改变版型轮廓、领口、袖型、腰部结构、裙摆结构、材质、配色和图案中的多数项目；
3. 不得复刻参考图的独特剪裁、品牌标志、文字、图案或装饰组合；
4. 输出完整正面服饰效果图，单件服装主体完整，纯净浅色背景，真实面料质感，结构合理，适合跨境电商选款评审；
5. 只输出最终图片生成提示词，不要解释分析过程，不要使用 Markdown。`

const NEGATIVE_PROMPT = '品牌标志，文字，水印，复制参考图图案，复刻原图独特剪裁，完全相同的领口、袖型、腰线和裙摆，人体畸形，多余肢体，服装结构错误，裁片断裂，低清晰度，模糊背景'

const endpoint = (baseUrl: string): string => {
  const base = baseUrl.replace(/\/+$/, '')
    .replace(/\/v1\/(?:chat\/completions|images\/(?:generations|edits))$/i, '')
  return `${base.replace(/\/v1$/i, '')}/v1/chat/completions`
}

const responseMessage = async (response: Response): Promise<string> => {
  const text = await response.text().catch(() => '')
  if (!text) return response.statusText || '多模态服务返回空错误'
  try {
    const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
    return typeof json.error === 'string' ? json.error : json.error?.message ?? json.message ?? text.slice(0, 800)
  } catch { return text.slice(0, 800) }
}

const responseContent = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') return ''
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content.flatMap((part) => {
      if (!part || typeof part !== 'object') return []
      const text = (part as { text?: unknown }).text
      return typeof text === 'string' ? [text] : []
    }).join('\n').trim()
  }
  return ''
}

export const createOpenAICompatiblePromptComposer = (config: PromptComposerConfig): PromptComposer => {
  const fetcher = config.fetch ?? fetch

  return {
    async compose(input) {
      if (!config.baseUrl) throw new Error('缺少 VISION_API_BASE_URL（可回退使用 IMAGE_API_BASE_URL）')
      if (!config.apiKey) throw new Error('缺少 VISION_API_KEY（可回退使用 IMAGE_API_KEY）')
      if (!input.referenceImages.length) throw new Error('请至少上传 1 张参考服饰图片')
      const referenceImages = normalizeGenerationParams({
        prompt: 'validate reference images',
        referenceImages: input.referenceImages,
      }).referenceImages ?? []
      const response = await fetcher(endpoint(config.baseUrl), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model?.trim() || 'gpt-4.1-mini',
          temperature: 0.4,
          max_tokens: 1200,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: '分析这些参考服饰图片，并生成同品类但明显不同款式的最终图片生成提示词。' },
                ...referenceImages.map((url) => ({ type: 'image_url', image_url: { url } })),
              ],
            },
          ],
        }),
      })
      if (!response.ok) throw new Error(`多模态识别失败（HTTP ${response.status}）：${await responseMessage(response)}`)
      const prompt = responseContent(await response.json())
      if (!prompt) throw new Error('多模态服务响应中没有可用的设计提示词')
      return { prompt, negativePrompt: NEGATIVE_PROMPT }
    },
  }
}