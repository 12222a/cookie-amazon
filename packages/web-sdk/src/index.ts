export {
  checkLogin,
  getExtensionStatus,
  getProfile,
  getTargetStatus,
  listTargets,
  ping,
  removeTargetPermission,
  requestTargetPermission,
  reverseSellerSpriteKeywords,
} from './client'
export { WebSdkError } from './errors'
export type {
  SellerSpriteKeywordReverseData,
  SellerSpriteKeywordReverseInput,
  TargetDescriptor,
  WebSdkOptions,
} from './client'