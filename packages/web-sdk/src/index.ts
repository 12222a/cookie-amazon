export {
  checkLogin,
  getExtensionStatus,
  getProfile,
  getTargetStatus,
  listTargets,
  ping,
  probeContentScript,
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
  ContentScriptProbeResult,
  WebSdkOptions,
} from './client'