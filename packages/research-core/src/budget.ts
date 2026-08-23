import type { ResearchBudget, ResearchBudgetKey } from './model'
import type { ResearchPolicy } from './policy'

export interface BudgetTracker {
  canConsume(capability: ResearchBudgetKey, amount?: number): boolean
  consume(capability: ResearchBudgetKey, amount?: number): boolean
  remaining(capability: ResearchBudgetKey): number
  used(): ResearchBudget
}

export const createBudgetTracker = (policy: ResearchPolicy): BudgetTracker => {
  const limits = { ...policy.budget }
  const usage: ResearchBudget = {
    discovery: 0,
    reverseKeywords: 0,
    keywordMining: 0,
    aba: 0,
    competitors: 0,
    market: 0,
    reviews: 0,
  }

  return {
    canConsume(capability, amount = 1) {
      return amount >= 0 && usage[capability] + amount <= limits[capability]
    },
    consume(capability, amount = 1) {
      if (!this.canConsume(capability, amount)) return false
      usage[capability] += amount
      return true
    },
    remaining(capability) {
      return Math.max(0, limits[capability] - usage[capability])
    },
    used() {
      return { ...usage }
    },
  }
}