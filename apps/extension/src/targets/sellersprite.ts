import {
  SELLERSPRITE_ORIGIN,
  SELLERSPRITE_TARGET_ID,
} from '@cookie-amazon/sellersprite'
import { createTargetAdapter } from './adapter'
import { TargetClientError } from './client'
import { createSellerSpriteOperationPolicy } from './policy'

export const SELLERSPRITE_ADAPTER = createTargetAdapter({
  targetId: SELLERSPRITE_TARGET_ID,
  displayName: '卖家精灵',
  origin: SELLERSPRITE_ORIGIN,
  operations: createSellerSpriteOperationPolicy(),
  checkLogin: (client) => client.executeHtmlLoginProbe(),
  getProfile: async () => {
    throw new TargetClientError('OPERATION_DISABLED')
  },
})