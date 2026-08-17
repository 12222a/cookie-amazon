export {
  checkLogin,
  getExtensionStatus,
  getProfile,
  getTargetStatus,
  listTargets,
  ping,
  removeTargetPermission,
  requestTargetPermission,
  researchSellerSpriteCompetitors,
  reverseSellerSpriteKeywords,
} from './client'
export { WebSdkError } from './errors'
export type {
  SellerSpriteCompetitorData,
  SellerSpriteCompetitorInput,
  SellerSpriteKeywordReverseData,
  SellerSpriteKeywordReverseInput,
  TargetDescriptor,
  WebSdkOptions,
} from './client'