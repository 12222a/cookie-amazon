import type { AnalysisCitation } from '@cookie-amazon/protocol'

export type MarkedSentence = { text: string; marks: string[] }

/**
 * 句中标号是渲染产物：模型只输出事实与它引用的来源 ID，编号由这里按来源清单的序号生成
 * （ADR-0005）。编号交给模型输出会在长回答里漂移，而校验发生在 ID 层——所以标号只认 ID。
 *
 * 一句话里常常并列好几个字段（「自然位为 3，广告位为 2」），整条标签与整条值都不会逐字出现，
 * 因此按词匹配：标签里的词出现，这个词所指的是哪个字段由标签自己限定
 * （「关键词 coffee maker 自然位」里的「自然位」）。值与 ID 一起作为兜底，
 * 只有在标签匹配不到任何东西时才用——否则两个都写 3 的来源会互相认领。
 *
 * 句子边界取句读符号（。！？；）与换行；期望值是设计约束，不是从实现反推的（见同目录测试）。
 */
const SENTENCE_BREAK = /(?<=[。！？；])|\n/
/** 标点、全角符号与空白：逐字比对前先去掉它们，避免「3，广告位」这类并列表述漏配。 */
const IGNORED_CHARS = /[\u3000-\u303f\uff00-\uffef\s]/g
/** 词是最小匹配单位：值里的「80%」与标签里的「coffee maker」都是两个词。 */
const WORDS = /[a-z0-9]+|[\u4e00-\u9fff]/g

const words = (value: string): string[] => (value.normalize('NFKC').toLowerCase().match(WORDS) ?? [])

const parsedOf = (value: string): { compact: string; wordSet: Set<string> } => {
  const normalized = value.normalize('NFKC')
  return {
    compact: normalized.replace(IGNORED_CHARS, '').toLowerCase(),
    wordSet: new Set(words(normalized)),
  }
}

/** 按词匹配：这段话里的词都被某个说法包含，才算它被提到了。 */
const mentionsAllWords = (sentence: { wordSet: Set<string> }, phrase: string): boolean => {
  const phraseWords = new Set(words(phrase))
  return phraseWords.size > 0 && [...phraseWords].every((word) => sentence.wordSet.has(word))
}

const mentionsVerbatim = (sentence: { compact: string }, phrase: string): boolean => {
  const compact = parsedOf(phrase).compact
  return compact.length > 0 && sentence.compact.includes(compact)
}

const mentions = (sentence: { compact: string; wordSet: Set<string> }, citation: AnalysisCitation): boolean => {
  // 整条标签、整条值或来源 ID 逐字出现，是最强的信号。
  if ([citation.label, citation.value, citation.id].some((phrase) => mentionsVerbatim(sentence, phrase))) return true
  // 并列字段的句子不会逐字给出整条标签，于是按词：标签的词都在句子里就算提到了这条来源。
  if (mentionsAllWords(sentence, citation.label)) return true
  // 值的词多于一个时才按值回落：只写一个数字不足以认定它指的是哪条来源。
  return words(citation.value).length > 1 && mentionsAllWords(sentence, citation.value)
}

export const markAnswerSentences = (
  values: readonly string[],
  citations: readonly AnalysisCitation[],
): MarkedSentence[] =>
  values.flatMap((value) => value.split(SENTENCE_BREAK)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .map((sentence) => {
      const parsed = parsedOf(sentence)
      return {
        text: sentence,
        marks: citations.flatMap((citation, index) => mentions(parsed, citation) ? [String(index + 1)] : []),
      }
    }))
