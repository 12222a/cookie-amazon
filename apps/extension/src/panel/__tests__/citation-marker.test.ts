import { describe, expect, it } from 'vitest'
import type { AnalysisCitation } from '@cookie-amazon/protocol'
import { markAnswerSentences } from '../citation-marker'

/**
 * 引用标号是渲染产物：模型只输出事实与它引用的来源 ID，编号由渲染层按来源清单的顺序生成。
 * 这里的期望值来自设计约束（ADR-0005）：编号从 1 开始、按来源清单顺序、一句话对应它提到的那些来源。
 */
const citations: AnalysisCitation[] = [
  { id: 'object.price', label: '前台价格', value: '19.99', source: 'storefront' },
  { id: 'keyword.row.0.natural', label: '关键词 stand 自然位', value: '3', source: 'sellersprite' },
  { id: 'reviews.sampled', label: '评论样本数', value: '120', source: 'sellersprite' },
]

describe('句中标号', () => {
  it('按来源清单序号给每条被引用的句子标号', () => {
    expect(markAnswerSentences(['前台价格是 19.99 美元。'], citations)).toEqual([
      { text: '前台价格是 19.99 美元。', marks: ['1'] },
    ])
  })

  it('一句话引用多条来源时标号按来源清单顺序排列', () => {
    expect(markAnswerSentences(['关键词 stand 自然位为 3，样本 120 条。'], citations)).toEqual([
      { text: '关键词 stand 自然位为 3，样本 120 条。', marks: ['2', '3'] },
    ])
  })

  it('把一段长回答拆成句子，每句各带自己的标号', () => {
    expect(markAnswerSentences(['前台价格是 19.99 美元。评论样本 120 条。'], citations)).toEqual([
      { text: '前台价格是 19.99 美元。', marks: ['1'] },
      { text: '评论样本 120 条。', marks: ['3'] },
    ])
  })

  it('一句话里并列多个字段时，每个字段各自取到自己的标号', () => {
    const keywordCitations: AnalysisCitation[] = [
      { id: 'keyword.row.0.keyword', label: '关键词 1', value: 'coffee maker', source: 'sellersprite' },
      { id: 'keyword.row.0.natural', label: '关键词 coffee maker 自然位', value: '3', source: 'sellersprite' },
      { id: 'keyword.row.0.ad', label: '关键词 coffee maker 广告位', value: '2', source: 'sellersprite' },
      { id: 'keyword.row.0.naturalShare', label: '关键词 coffee maker 自然流量', value: '80%', source: 'sellersprite' },
    ]
    expect(markAnswerSentences(
      ['关键词 coffee maker 自然位为 3，广告位为 2，自然流量占比为 80%。'],
      keywordCitations,
    )).toEqual([{ text: '关键词 coffee maker 自然位为 3，广告位为 2，自然流量占比为 80%。', marks: ['1', '2', '3', '4'] }])
  })

  it('来源 ID 被逐字写进句子时也算引用到', () => {
    expect(markAnswerSentences(['见 keyword.row.0.natural。'], citations)).toEqual([
      { text: '见 keyword.row.0.natural。', marks: ['2'] },
    ])
  })

  it('没有提到任何来源的句子不给标号', () => {
    expect(markAnswerSentences(['先说三条事实。'], citations)).toEqual([
      { text: '先说三条事实。', marks: [] },
    ])
  })

  it('来源清单为空时不编号，也不丢句子', () => {
    expect(markAnswerSentences(['先说三条事实。', '没有可引用的字段。'], [])).toEqual([
      { text: '先说三条事实。', marks: [] },
      { text: '没有可引用的字段。', marks: [] },
    ])
  })
})
