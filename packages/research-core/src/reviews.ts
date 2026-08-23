import type { ReviewEvidence, ReviewItem, ReviewPainPoint } from './model'

interface ThemeRule {
  id: string
  label: string
  pattern: RegExp
  direction: string
}

const THEME_RULES: readonly ThemeRule[] = [
  { id: 'quality', label: '质量与耐久', pattern: /\b(broke|broken|crack|defect|flimsy|cheap|poor quality|stopped working|durab)/i, direction: '强化耐久性和出厂质量检查' },
  { id: 'fit-size', label: '尺寸与适配', pattern: /\b(size|small|large|tight|loose|fit|short|long|inch)/i, direction: '明确尺寸说明并优化适配范围' },
  { id: 'material', label: '材质', pattern: /\b(material|plastic|metal|fabric|wood|rubber|smell|odor)/i, direction: '升级材料并准确披露材质' },
  { id: 'performance', label: '核心性能', pattern: /\b(weak|slow|noisy|noise|power|battery|heat|leak|performance|doesn.t work)/i, direction: '针对核心性能设定可验证的改进指标' },
  { id: 'installation-use', label: '安装与使用', pattern: /\b(install|setup|assemble|instruction|difficult|hard to use|confusing)/i, direction: '简化安装步骤并补充清晰说明' },
  { id: 'packaging-shipping', label: '包装与运输', pattern: /\b(package|packaging|shipping|delivery|arrived|damaged|box)/i, direction: '提升运输包装和到货保护' },
  { id: 'description-mismatch', label: '描述不符', pattern: /\b(not as described|misleading|picture|photo|different from|description)/i, direction: '校准详情页描述与实物表现' },
  { id: 'appearance-color', label: '外观与颜色', pattern: /\b(color|colour|appearance|finish|scratch|paint)/i, direction: '提高外观一致性并校准颜色展示' },
  { id: 'value', label: '价值感', pattern: /\b(expensive|overpriced|price|waste of money|not worth)/i, direction: '调整价值组合并强化可感知价值' },
  { id: 'accessories', label: '配件', pattern: /\b(accessor|missing|part|piece|cable|adapter|screw)/i, direction: '完善配件清单和缺件检查' },
  { id: 'service', label: '售后', pattern: /\b(refund|return|support|service|warranty|replacement)/i, direction: '改善售后响应和质保说明' },
]

interface MutablePainPoint {
  rule: ThemeRule
  count: number
  lowStarCount: number
  asins: Set<string>
  variations: Set<string>
  starTotal: number
  excerpts: string[]
}

export const analyzeReviews = (items: readonly ReviewItem[]): ReviewEvidence => {
  const points = new Map<string, MutablePainPoint>()
  for (const review of items) {
    const text = `${review.title} ${review.content}`.trim()
    if (!text) continue
    for (const rule of THEME_RULES) {
      if (!rule.pattern.test(text)) continue
      const current = points.get(rule.id) ?? {
        rule,
        count: 0,
        lowStarCount: 0,
        asins: new Set<string>(),
        variations: new Set<string>(),
        starTotal: 0,
        excerpts: [],
      }
      current.count += 1
      if (review.star <= 3) current.lowStarCount += 1
      current.asins.add(review.asin)
      for (const variation of review.variation) if (variation) current.variations.add(variation)
      current.starTotal += review.star
      if (current.excerpts.length < 3) current.excerpts.push(text.slice(0, 180))
      points.set(rule.id, current)
    }
  }

  const painPoints: ReviewPainPoint[] = [...points.values()].map((point) => ({
    id: point.rule.id,
    label: point.rule.label,
    count: point.count,
    asinCount: point.asins.size,
    lowStarShare: point.count === 0 ? 0 : point.lowStarCount / point.count,
    averageStar: point.count === 0 ? 0 : point.starTotal / point.count,
    variations: [...point.variations],
    excerpts: point.excerpts,
    direction: point.rule.direction,
  })).sort((left, right) => right.lowStarShare * right.count - left.lowStarShare * left.count || right.count - left.count)

  return {
    sampled: items.length,
    lowStarCount: items.filter((item) => item.star <= 3).length,
    painPoints,
  }
}