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
  selectSellerSpriteProducts,
  mineSellerSpriteKeywords,
} from './client'
export { WebSdkError } from './errors'
export type {
  SellerSpriteCompetitorData,
  SellerSpriteCompetitorInput,
  SellerSpriteProductSelectionData,
  SellerSpriteProductSelectionInput,
  SellerSpriteKeywordReverseData,
  SellerSpriteKeywordReverseInput,
  SellerSpriteKeywordMiningData,
  SellerSpriteKeywordMiningInput,
  TargetDescriptor,
  WebSdkOptions,
} from './client'