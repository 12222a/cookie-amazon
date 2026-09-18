import { createTargetAdapter } from './adapter'
import { TargetClientError } from './client'
import { createAmazonOperationPolicy } from './policy'

export const AMAZON_TARGET_ID = 'amazon' as const
export const AMAZON_ORIGIN = 'https://www.amazon.com' as const

/**
 * The amazon target exists so the extension can hold a host permission and
 * inject page scripts for amazon.com. It issues no requests of its own in this
 * step, so every operation is disabled and both credential hooks refuse.
 */
export const AMAZON_ADAPTER = createTargetAdapter({
  targetId: AMAZON_TARGET_ID,
  displayName: '亚马逊前台',
  origin: AMAZON_ORIGIN,
  operations: createAmazonOperationPolicy(),
  checkLogin: async () => {
    throw new TargetClientError('OPERATION_DISABLED')
  },
  getProfile: async () => {
    throw new TargetClientError('OPERATION_DISABLED')
  },
})
