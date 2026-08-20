import type {
  SellerSpriteCompetitorData,
  SellerSpriteKeywordReverseData,
  SellerSpriteKeywordReverseInput,
} from '@cookie-amazon/protocol'
import { reverseSellerSpriteKeywords } from '@cookie-amazon/web-sdk'
import { buildKeywordReverseInput } from './input'
import type { AsinKeywordEvidence } from './keyword-market'
import { selectResearchAsins } from './asin-candidates'

export type KeywordLookupState = {
  status: 'idle' | 'loading' | 'complete' | 'partial' | 'unavailable' | 'unsupported-market'
  market: string | null
  attemptedAsinCount: number
  successfulAsinCount: number
}

export type KeywordLookupResult = {
  state: KeywordLookupState
  evidence: readonly AsinKeywordEvidence[]
}

type ReverseKeywords = (
  input: SellerSpriteKeywordReverseInput,
  options: { timeoutMs: number },
) => Promise<SellerSpriteKeywordReverseData>

export const EMPTY_KEYWORD_LOOKUP: KeywordLookupState = {
  status: 'idle',
  market: null,
  attemptedAsinCount: 0,
  successfulAsinCount: 0,
}

export const prepareKeywordLookup = (
  data: SellerSpriteCompetitorData,
  market: string,
  reverse: ReverseKeywords = reverseSellerSpriteKeywords,
): { initialState: KeywordLookupState; run: () => Promise<KeywordLookupResult> } => {
  if (market !== 'US') {
    const state: KeywordLookupState = {
      status: 'unsupported-market', market, attemptedAsinCount: 0, successfulAsinCount: 0,
    }
    return { initialState: state, run: async () => ({ state, evidence: [] }) }
  }

  const candidates = selectResearchAsins(data)
  if (candidates.length === 0) {
    const state: KeywordLookupState = {
      status: 'unavailable', market, attemptedAsinCount: 0, successfulAsinCount: 0,
    }
    return { initialState: state, run: async () => ({ state, evidence: [] }) }
  }

  const initialState: KeywordLookupState = {
    status: 'loading', market, attemptedAsinCount: candidates.length, successfulAsinCount: 0,
  }
  return {
    initialState,
    run: async () => {
      const evidence: AsinKeywordEvidence[] = []
      for (const asin of candidates) {
        try {
          const keywordData = await reverse(buildKeywordReverseInput(asin, market), { timeoutMs: 20_000 })
          evidence.push({ asin, data: keywordData })
        } catch {
          // Competitor evidence remains valid when one reverse-keyword request fails.
        }
      }
      return {
        state: {
          status: evidence.length === candidates.length ? 'complete' : evidence.length > 0 ? 'partial' : 'unavailable',
          market,
          attemptedAsinCount: candidates.length,
          successfulAsinCount: evidence.length,
        },
        evidence,
      }
    },
  }
}