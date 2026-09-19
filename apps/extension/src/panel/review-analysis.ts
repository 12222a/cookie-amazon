import { analyzeReviews, selectStrongPainPoints, type ReviewItem, type ReviewPainPoint } from '@cookie-amazon/research-core'
import type { SellerSpriteReviewComment, SellerSpriteReviewCommentsData } from '@cookie-amazon/protocol'

/** 低于这个数量只展示样本状态，不把偶然出现的词当成商品痛点。 */
export const MIN_REVIEW_SAMPLE_COUNT = 6

export type ReviewPanelData = {
  sampled: number
  total: number
  coverage: number
  lowStarCount: number
  painPoints: ReviewPainPoint[]
  sampleSufficient: boolean
}

const toReviewItem = (comment: SellerSpriteReviewComment): ReviewItem => ({
  id: comment.id,
  asin: comment.asin,
  star: comment.star,
  title: comment.title,
  content: comment.content,
  variation: comment.skus,
  likes: comment.likes,
})

/** SellerSprite 评论字段和研究核心字段只在命名上不同，这里集中做一次映射。 */
export const analyzeSellerSpriteReviews = (data: SellerSpriteReviewCommentsData): ReviewPanelData => {
  const evidence = analyzeReviews(data.items.map(toReviewItem))
  const sampleSufficient = evidence.sampled >= MIN_REVIEW_SAMPLE_COUNT
  const coverage = data.total <= 0 ? 0 : Math.min(1, evidence.sampled / data.total)
  return {
    sampled: evidence.sampled,
    total: data.total,
    coverage,
    lowStarCount: evidence.lowStarCount,
    painPoints: sampleSufficient ? selectStrongPainPoints(evidence) : [],
    sampleSufficient,
  }
}
