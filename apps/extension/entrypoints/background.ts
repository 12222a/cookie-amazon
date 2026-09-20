import { onMessage } from 'webext-bridge/background'
import {
  CAPABILITIES,
  MESSAGE_NAMESPACE,
  PROTOCOL_VERSION,
  COMPETITOR_RESEARCH_ACTION,
  PRODUCT_SELECTION_ACTION,
  SELLERSPRITE_CATEGORY_NODES_ACTION,
  SELLERSPRITE_REVIEW_COMMENTS_ACTION,
  MARKET_SELECTION_ACTION,
  KEYWORD_PRODUCT_RESEARCH_ACTION,
  KEYWORD_MINING_ACTION,
  SELLERSPRITE_KEYWORD_REVERSE_ACTION,
  SELLERSPRITE_MONTHLY_ACTION,
  SELLERSPRITE_MARKET_RESEARCH_ACTION,
  SELLERSPRITE_ABA_PERIODS_ACTION,
  SELLERSPRITE_ABA_RESEARCH_ACTION,
  TARGET_ACTIONS,
  isPingRequest,
  isSellerSpriteCompetitorRequest,
  isSellerSpriteProductSelectionRequest,
  isSellerSpriteCategoryNodesRequest,
  isSellerSpriteReviewCommentsRequest,
  isSellerSpriteHtmlSessionRequest,
  isSellerSpriteKeywordMiningRequest,
  isSellerSpriteKeywordReverseRequest,
  isSellerSpriteMonthlyRequest,
  isSellerSpriteMarketResearchRequest,
  isSellerSpriteAbaPeriodsRequest,
  isSellerSpriteAbaResearchRequest,
  isTargetRequest,
  type PingResponse,
  type ProtocolError,
  type SellerSpriteKeywordReverseResponse,
  type SellerSpriteKeywordReverseSuccess,
  type SellerSpriteHtmlSessionResponse,
  type SellerSpriteHtmlSessionSuccess,
  type SellerSpriteKeywordMiningResponse,
  type SellerSpriteKeywordMiningSuccess,
  type TargetDescriptor,
  type TargetResponse,
  type TargetSuccess,
} from '@cookie-amazon/protocol'
import type { RemoteConfig } from '@cookie-amazon/remote-config'
import { ExtensionRemoteConfigManager } from '../src/remote-config'
import { TargetClient, TargetClientError } from '../src/targets/client'
import { TargetPermissionManager } from '../src/targets/permissions'
import { TARGET_REGISTRY } from '../src/targets/registry'
import {
  executeSellerSpriteKeywordProductResearch,
  executeSellerSpriteMarketSelection,
  listSellerSpriteAbaPeriods,
  researchSellerSpriteAba,
  mineSellerSpriteKeywords,
  readSellerSpriteMonthly,
  researchSellerSpriteMarket,
  reverseSellerSpriteKeywords,
  researchSellerSpriteCompetitors,
  selectSellerSpriteProducts,
  listSellerSpriteCategoryNodes,
  listSellerSpriteReviewComments,
} from '../src/targets/sellersprite'
import { resolveRuntimeTargetPolicy } from '../src/targets/runtime-policy'
import { installWebTabRepair } from '../src/background/web-tab-repair'
import { checkSellerSpriteConnection, withPageFallback } from '../src/background/sellersprite-session'
import { isExtensionRuntimeRequestEnvelope } from '../src/runtime-bridge'
import { registerOpenSidePanelHandler } from '../src/panel/open-side-panel'
import { registerAnalysisAskRelay } from '../src/panel/analysis-ask-relay'

const permissionManager = new TargetPermissionManager(TARGET_REGISTRY, browser.permissions)
const configManager = new ExtensionRemoteConfigManager(browser.storage.local)

const invalidMessage = (requestId = 'unknown'): ProtocolError => ({
  namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
  requestId, ok: false, error: { code: 'INVALID_MESSAGE' },
})

const targetError = (
  requestId: string,
  code: ProtocolError['error']['code'],
  details: { httpStatus?: number; targetCode?: string | number; targetMessage?: string } = {},
): ProtocolError => ({
  namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
  requestId, ok: false,
  error: {
    code,
    ...(details.httpStatus === undefined ? {} : { httpStatus: details.httpStatus }),
    ...(details.targetCode === undefined ? {} : { targetCode: details.targetCode }),
    ...(details.targetMessage === undefined ? {} : { targetMessage: details.targetMessage }),
  },
})

const targetClientError = (requestId: string, error: unknown): ProtocolError =>
  error instanceof TargetClientError
    ? targetError(requestId, error.code, {
        ...(error.status === undefined ? {} : { httpStatus: error.status }),
        ...(error.targetCode === undefined ? {} : { targetCode: error.targetCode }),
        ...(error.targetMessage === undefined ? {} : { targetMessage: error.targetMessage }),
      })
    : targetError(requestId, 'TARGET_API_ERROR')

const requestIdOf = (data: unknown): string =>
  typeof data === 'object' && data !== null
    && typeof (data as { requestId?: unknown }).requestId === 'string'
    && (data as { requestId: string }).requestId.length > 0
    ? (data as { requestId: string }).requestId
    : 'unknown'

const guarded = <T>(handler: (message: { data: unknown }) => T | Promise<T>) =>
  async (message: { data: unknown }): Promise<T | ProtocolError> => {
    try {
      return await handler(message)
    } catch {
      return targetError(requestIdOf(message.data), 'TARGET_API_ERROR')
    }
  }

const descriptor = async (targetId: string, config: RemoteConfig | null): Promise<TargetDescriptor | ProtocolError> => {
  const adapter = TARGET_REGISTRY.get(targetId)
  if (!adapter) return targetError('unknown', 'UNKNOWN_TARGET')
  const policy = resolveRuntimeTargetPolicy(adapter, config)
  const granted = policy.enabled && await permissionManager.hasPermission(targetId)
  const status = TARGET_REGISTRY.status(targetId, granted, { [targetId]: { enabled: policy.enabled } })
  return {
    targetId: adapter.targetId,
    displayName: adapter.displayName,
    origin: adapter.origin,
    enabled: policy.enabled,
    status: status === 'unknown' ? 'disabled' : status,
  }
}

const handleTargetMessage = async ({ data }: { data: unknown }): Promise<TargetResponse> => {
  if (!isTargetRequest(data)) return invalidMessage()
  const config = await configManager.load()

  if (data.action === 'LIST_TARGETS') {
    const targets = await Promise.all(TARGET_REGISTRY.list().map(async (item) => {
      const target = await descriptor(item.targetId, config)
      if ('targetId' in target) return target
      return {
        targetId: item.targetId,
        displayName: item.displayName,
        origin: item.origin,
        enabled: item.enabled,
        status: 'disabled' as const,
      }
    }))
    return {
      namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
      requestId: data.requestId, action: data.action, ok: true, data: { targets },
    } satisfies TargetSuccess
  }

  const targetId = data.payload?.targetId
  if (!targetId) return invalidMessage(data.requestId)
  const adapter = TARGET_REGISTRY.get(targetId)
  if (!adapter) return targetError(data.requestId, 'UNKNOWN_TARGET')
  const runtimePolicy = resolveRuntimeTargetPolicy(adapter, config)

  if (data.action === 'REMOVE_TARGET_PERMISSION') {
    const removed = await permissionManager.removePermission(targetId)
    const granted = removed ? await permissionManager.hasPermission(targetId) : true
    return {
      namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
      requestId: data.requestId, action: data.action, ok: true,
      data: {
        targetId,
        granted,
        status: runtimePolicy.enabled ? (granted ? 'ready' : 'permission-required') : 'disabled',
      },
    } satisfies TargetSuccess
  }

  if (data.action === 'GET_TARGET_STATUS') {
    const granted = await permissionManager.hasPermission(targetId)
    return {
      namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
      requestId: data.requestId, action: data.action, ok: true,
      data: {
        targetId: adapter.targetId, displayName: adapter.displayName, origin: adapter.origin,
        enabled: runtimePolicy.enabled,
        status: (() => {
          const status = TARGET_REGISTRY.status(targetId, granted, { [targetId]: { enabled: runtimePolicy.enabled } })
          return status === 'unknown' ? 'disabled' : status
        })(),
        granted,
        capabilities: runtimePolicy.capabilities,
      },
    } satisfies TargetSuccess
  }

  if (!runtimePolicy.enabled) return targetError(data.requestId, 'TARGET_DISABLED')

  if (data.action === 'REQUEST_TARGET_PERMISSION') {
    return targetError(data.requestId, 'PERMISSION_REQUIRES_EXTENSION_UI')
  }

  if (data.action === 'CHECK_LOGIN') {
    if (!runtimePolicy.capabilities.includes('CHECK_LOGIN')) {
      return targetError(data.requestId, 'OPERATION_DISABLED')
    }
    if (!(await permissionManager.hasPermission(targetId))) {
      return targetError(data.requestId, 'TARGET_PERMISSION_MISSING')
    }
    try {
      const result = adapter.targetId === 'sellersprite'
        ? await checkSellerSpriteConnection(adapter, runtimePolicy)
        : { targetId, loggedIn: (await adapter.checkLogin(new TargetClient(adapter, undefined, runtimePolicy.operationOverrides))).loggedIn }
      return {
        namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
        requestId: data.requestId, action: data.action, ok: true,
        data: result,
      } satisfies TargetSuccess
    } catch (error: unknown) {
      if (error instanceof TargetClientError) return targetError(data.requestId, error.code)
      return targetError(data.requestId, 'TARGET_API_ERROR')
    }
  }

  if (data.action === 'GET_PROFILE') {
    if (!runtimePolicy.features.profile) return targetError(data.requestId, 'FEATURE_DISABLED')
    if (!runtimePolicy.capabilities.includes('GET_PROFILE')) {
      return targetError(data.requestId, 'OPERATION_DISABLED')
    }
    if (!(await permissionManager.hasPermission(targetId))) {
      return targetError(data.requestId, 'TARGET_PERMISSION_MISSING')
    }
    const client = new TargetClient(adapter, undefined, runtimePolicy.operationOverrides)
    try {
      const login = await adapter.checkLogin(client)
      if (!login.loggedIn) return targetError(data.requestId, 'TARGET_NOT_LOGGED_IN')
      const profile = await adapter.getProfile(client)
      return {
        namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
        requestId: data.requestId, action: data.action, ok: true,
        data: { targetId, profile },
      } satisfies TargetSuccess
    } catch (error: unknown) {
      if (error instanceof TargetClientError) return targetError(data.requestId, error.code)
      return targetError(data.requestId, 'TARGET_API_ERROR')
    }
  }

  return targetError(data.requestId, 'UNKNOWN_ACTION')
}

const handleKeywordReverseMessage = async ({ data }: { data: unknown }): Promise<SellerSpriteKeywordReverseResponse> => {
  if (!isSellerSpriteKeywordReverseRequest(data)) return invalidMessage()
  const { requestId } = data
  const adapter = TARGET_REGISTRY.get(data.payload.targetId)
  if (!adapter || adapter.targetId !== 'sellersprite') return targetError(requestId, 'UNKNOWN_TARGET')
  const runtimePolicy = resolveRuntimeTargetPolicy(adapter, await configManager.load())
  if (!runtimePolicy.enabled) return targetError(requestId, 'TARGET_DISABLED')
  if (!runtimePolicy.capabilities.includes(SELLERSPRITE_KEYWORD_REVERSE_ACTION)) {
    return targetError(requestId, 'OPERATION_DISABLED')
  }
  if (!(await permissionManager.hasPermission(adapter.targetId))) {
    return targetError(requestId, 'TARGET_PERMISSION_MISSING')
  }
  try {
    const result = await withPageFallback(
      adapter,
      runtimePolicy,
      () => reverseSellerSpriteKeywords(new TargetClient(adapter, undefined, runtimePolicy.operationOverrides), data.payload.input),
      (client) => reverseSellerSpriteKeywords(client, data.payload.input),
    )
    return {
      namespace: MESSAGE_NAMESPACE,
      kind: 'response',
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      action: SELLERSPRITE_KEYWORD_REVERSE_ACTION,
      ok: true,
      data: result,
    } satisfies SellerSpriteKeywordReverseSuccess
  } catch (error: unknown) {
    return targetClientError(requestId, error)
  }
}

const handleCompetitorMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteCompetitorResponse> => {
  if (!isSellerSpriteCompetitorRequest(data)) return invalidMessage()
  const { requestId } = data
  const adapter = TARGET_REGISTRY.get(data.payload.targetId)
  if (!adapter || adapter.targetId !== 'sellersprite') return targetError(requestId, 'UNKNOWN_TARGET')
  const runtimePolicy = resolveRuntimeTargetPolicy(adapter, await configManager.load())
  if (!runtimePolicy.enabled) return targetError(requestId, 'TARGET_DISABLED')
  if (!runtimePolicy.capabilities.includes(COMPETITOR_RESEARCH_ACTION)) return targetError(requestId, 'OPERATION_DISABLED')
  if (!(await permissionManager.hasPermission(adapter.targetId))) return targetError(requestId, 'TARGET_PERMISSION_MISSING')
  try {
    const result = await withPageFallback(
      adapter,
      runtimePolicy,
      () => researchSellerSpriteCompetitors(new TargetClient(adapter, undefined, runtimePolicy.operationOverrides), data.payload.input),
      (client) => researchSellerSpriteCompetitors(client, data.payload.input),
    )
    return {
      namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
      requestId, action: COMPETITOR_RESEARCH_ACTION, ok: true, data: result,
    }
  } catch (error: unknown) {
    return targetClientError(requestId, error)
  }
}

const handleProductSelectionMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteProductSelectionResponse> => {
  if (!isSellerSpriteProductSelectionRequest(data)) return invalidMessage()
  const { requestId } = data
  const adapter = TARGET_REGISTRY.get(data.payload.targetId)
  if (!adapter || adapter.targetId !== 'sellersprite') return targetError(requestId, 'UNKNOWN_TARGET')
  const runtimePolicy = resolveRuntimeTargetPolicy(adapter, await configManager.load())
  if (!runtimePolicy.enabled) return targetError(requestId, 'TARGET_DISABLED')
  if (!runtimePolicy.capabilities.includes(PRODUCT_SELECTION_ACTION)) return targetError(requestId, 'OPERATION_DISABLED')
  if (!(await permissionManager.hasPermission(adapter.targetId))) return targetError(requestId, 'TARGET_PERMISSION_MISSING')
  try {
    const result = await withPageFallback(
      adapter,
      runtimePolicy,
      () => selectSellerSpriteProducts(new TargetClient(adapter, undefined, runtimePolicy.operationOverrides), data.payload.input),
      (client) => selectSellerSpriteProducts(client, data.payload.input),
    )
    return {
      namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
      requestId, action: PRODUCT_SELECTION_ACTION, ok: true, data: result,
    }
  } catch (error: unknown) {
    return targetClientError(requestId, error)
  }
}

const handleCategoryNodesMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteCategoryNodesResponse> => {
  if (!isSellerSpriteCategoryNodesRequest(data)) return invalidMessage()
  const { requestId } = data
  const adapter = TARGET_REGISTRY.get(data.payload.targetId)
  if (!adapter || adapter.targetId !== 'sellersprite') return targetError(requestId, 'UNKNOWN_TARGET')
  const runtimePolicy = resolveRuntimeTargetPolicy(adapter, await configManager.load())
  if (!runtimePolicy.enabled) return targetError(requestId, 'TARGET_DISABLED')
  if (!runtimePolicy.capabilities.includes(SELLERSPRITE_CATEGORY_NODES_ACTION)) return targetError(requestId, 'OPERATION_DISABLED')
  if (!(await permissionManager.hasPermission(adapter.targetId))) return targetError(requestId, 'TARGET_PERMISSION_MISSING')
  try {
    const result = await withPageFallback(
      adapter,
      runtimePolicy,
      () => listSellerSpriteCategoryNodes(new TargetClient(adapter, undefined, runtimePolicy.operationOverrides), data.payload.input),
      (client) => listSellerSpriteCategoryNodes(client, data.payload.input),
    )
    return { namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION, requestId, action: SELLERSPRITE_CATEGORY_NODES_ACTION, ok: true, data: result }
  } catch (error: unknown) {
    return targetClientError(requestId, error)
  }
}

const handleReviewCommentsMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteReviewCommentsResponse> => {
  if (!isSellerSpriteReviewCommentsRequest(data)) return invalidMessage()
  const { requestId } = data
  const adapter = TARGET_REGISTRY.get(data.payload.targetId)
  if (!adapter || adapter.targetId !== 'sellersprite') return targetError(requestId, 'UNKNOWN_TARGET')
  const runtimePolicy = resolveRuntimeTargetPolicy(adapter, await configManager.load())
  if (!runtimePolicy.enabled) return targetError(requestId, 'TARGET_DISABLED')
  if (!runtimePolicy.capabilities.includes(SELLERSPRITE_REVIEW_COMMENTS_ACTION)) return targetError(requestId, 'OPERATION_DISABLED')
  if (!(await permissionManager.hasPermission(adapter.targetId))) return targetError(requestId, 'TARGET_PERMISSION_MISSING')
  try {
    const result = await withPageFallback(
      adapter,
      runtimePolicy,
      () => listSellerSpriteReviewComments(new TargetClient(adapter, undefined, runtimePolicy.operationOverrides), data.payload.input),
      (client) => listSellerSpriteReviewComments(client, data.payload.input),
    )
    return { namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION, requestId, action: SELLERSPRITE_REVIEW_COMMENTS_ACTION, ok: true, data: result }
  } catch (error: unknown) {
    return targetClientError(requestId, error)
  }
}

const handleMonthlyMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteMonthlyResponse> => {
  if (!isSellerSpriteMonthlyRequest(data)) return invalidMessage()
  const { requestId } = data
  const adapter = TARGET_REGISTRY.get(data.payload.targetId)
  if (!adapter || adapter.targetId !== 'sellersprite') return targetError(requestId, 'UNKNOWN_TARGET')
  const runtimePolicy = resolveRuntimeTargetPolicy(adapter, await configManager.load())
  if (!runtimePolicy.enabled) return targetError(requestId, 'TARGET_DISABLED')
  if (!runtimePolicy.capabilities.includes(SELLERSPRITE_MONTHLY_ACTION)) return targetError(requestId, 'OPERATION_DISABLED')
  if (!(await permissionManager.hasPermission(adapter.targetId))) return targetError(requestId, 'TARGET_PERMISSION_MISSING')
  try {
    const result = await withPageFallback(
      adapter,
      runtimePolicy,
      () => readSellerSpriteMonthly(new TargetClient(adapter, undefined, runtimePolicy.operationOverrides), data.payload.input),
      (client) => readSellerSpriteMonthly(client, data.payload.input),
    )
    return { namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION, requestId, action: SELLERSPRITE_MONTHLY_ACTION, ok: true, data: result }
  } catch (error: unknown) {
    return targetClientError(requestId, error)
  }
}
const handleMarketResearchMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteMarketResearchResponse> => {
  if (!isSellerSpriteMarketResearchRequest(data)) return invalidMessage()
  const { requestId } = data
  const adapter = TARGET_REGISTRY.get(data.payload.targetId)
  if (!adapter || adapter.targetId !== 'sellersprite') return targetError(requestId, 'UNKNOWN_TARGET')
  const runtimePolicy = resolveRuntimeTargetPolicy(adapter, await configManager.load())
  if (!runtimePolicy.enabled) return targetError(requestId, 'TARGET_DISABLED')
  if (!runtimePolicy.capabilities.includes('SELLERSPRITE_MARKET_RESEARCH')) return targetError(requestId, 'OPERATION_DISABLED')
  if (!(await permissionManager.hasPermission(adapter.targetId))) return targetError(requestId, 'TARGET_PERMISSION_MISSING')
  try {
    const result = await withPageFallback(
      adapter,
      runtimePolicy,
      () => researchSellerSpriteMarket(new TargetClient(adapter, undefined, runtimePolicy.operationOverrides), data.payload.input),
      (client) => researchSellerSpriteMarket(client, data.payload.input),
    )
    return {
      namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
      requestId, action: SELLERSPRITE_MARKET_RESEARCH_ACTION, ok: true, data: result,
    }
  } catch (error: unknown) {
    return targetClientError(requestId, error)
  }
}

const handleAbaPeriodsMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteAbaPeriodsResponse> => {
  if (!isSellerSpriteAbaPeriodsRequest(data)) return invalidMessage()
  const { requestId } = data
  const adapter = TARGET_REGISTRY.get(data.payload.targetId)
  if (!adapter || adapter.targetId !== 'sellersprite') return targetError(requestId, 'UNKNOWN_TARGET')
  const runtimePolicy = resolveRuntimeTargetPolicy(adapter, await configManager.load())
  if (!runtimePolicy.enabled) return targetError(requestId, 'TARGET_DISABLED')
  if (!runtimePolicy.capabilities.includes(SELLERSPRITE_ABA_PERIODS_ACTION)) return targetError(requestId, 'OPERATION_DISABLED')
  if (!(await permissionManager.hasPermission(adapter.targetId))) return targetError(requestId, 'TARGET_PERMISSION_MISSING')
  try {
    const result = await withPageFallback(
      adapter,
      runtimePolicy,
      () => listSellerSpriteAbaPeriods(new TargetClient(adapter, undefined, runtimePolicy.operationOverrides)),
      (client) => listSellerSpriteAbaPeriods(client),
    )
    return {
      namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
      requestId, action: SELLERSPRITE_ABA_PERIODS_ACTION, ok: true, data: result,
    }
  } catch (error: unknown) {
    return targetClientError(requestId, error)
  }
}

const handleAbaResearchMessage = async ({ data }: { data: unknown }): Promise<import('@cookie-amazon/protocol').SellerSpriteAbaResearchResponse> => {
  if (!isSellerSpriteAbaResearchRequest(data)) return invalidMessage()
  const { requestId } = data
  const adapter = TARGET_REGISTRY.get(data.payload.targetId)
  if (!adapter || adapter.targetId !== 'sellersprite') return targetError(requestId, 'UNKNOWN_TARGET')
  const runtimePolicy = resolveRuntimeTargetPolicy(adapter, await configManager.load())
  if (!runtimePolicy.enabled) return targetError(requestId, 'TARGET_DISABLED')
  if (!runtimePolicy.capabilities.includes(SELLERSPRITE_ABA_RESEARCH_ACTION)) return targetError(requestId, 'OPERATION_DISABLED')
  if (!(await permissionManager.hasPermission(adapter.targetId))) return targetError(requestId, 'TARGET_PERMISSION_MISSING')
  try {
    const result = await withPageFallback(
      adapter,
      runtimePolicy,
      () => researchSellerSpriteAba(new TargetClient(adapter, undefined, runtimePolicy.operationOverrides), data.payload.input),
      (client) => researchSellerSpriteAba(client, data.payload.input),
    )
    return {
      namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
      requestId, action: SELLERSPRITE_ABA_RESEARCH_ACTION, ok: true, data: result,
    }
  } catch (error: unknown) {
    return targetClientError(requestId, error)
  }
}

const handleKeywordMiningMessage = async ({ data }: { data: unknown }): Promise<SellerSpriteKeywordMiningResponse> => {
  if (!isSellerSpriteKeywordMiningRequest(data)) return invalidMessage()
  const { requestId } = data
  const adapter = TARGET_REGISTRY.get(data.payload.targetId)
  if (!adapter || adapter.targetId !== 'sellersprite') return targetError(requestId, 'UNKNOWN_TARGET')
  const runtimePolicy = resolveRuntimeTargetPolicy(adapter, await configManager.load())
  if (!runtimePolicy.enabled) return targetError(requestId, 'TARGET_DISABLED')
  if (!runtimePolicy.capabilities.includes(KEYWORD_MINING_ACTION)) return targetError(requestId, 'OPERATION_DISABLED')
  if (!(await permissionManager.hasPermission(adapter.targetId))) return targetError(requestId, 'TARGET_PERMISSION_MISSING')
  try {
    const result = await withPageFallback(
      adapter,
      runtimePolicy,
      () => mineSellerSpriteKeywords(new TargetClient(adapter, undefined, runtimePolicy.operationOverrides), data.payload.input),
      (client) => mineSellerSpriteKeywords(client, data.payload.input),
    )
    return { namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION, requestId, action: KEYWORD_MINING_ACTION, ok: true, data: result } satisfies SellerSpriteKeywordMiningSuccess
  } catch (error: unknown) {
    return targetClientError(requestId, error)
  }
}

const handleHtmlSessionMessage = async ({ data }: { data: unknown }): Promise<SellerSpriteHtmlSessionResponse> => {
  if (!isSellerSpriteHtmlSessionRequest(data)) return invalidMessage()
  const { requestId } = data
  const adapter = TARGET_REGISTRY.get(data.payload.targetId)
  if (!adapter || adapter.targetId !== 'sellersprite') return targetError(requestId, 'UNKNOWN_TARGET')
  const runtimePolicy = resolveRuntimeTargetPolicy(adapter, await configManager.load())
  if (!runtimePolicy.enabled) return targetError(requestId, 'TARGET_DISABLED')
  if (!runtimePolicy.capabilities.includes(data.action)) return targetError(requestId, 'OPERATION_DISABLED')
  if (!(await permissionManager.hasPermission(adapter.targetId))) return targetError(requestId, 'TARGET_PERMISSION_MISSING')
  try {
    const result = await withPageFallback(
      adapter,
      runtimePolicy,
      () => data.action === MARKET_SELECTION_ACTION
        ? executeSellerSpriteMarketSelection(new TargetClient(adapter, undefined, runtimePolicy.operationOverrides))
        : executeSellerSpriteKeywordProductResearch(new TargetClient(adapter, undefined, runtimePolicy.operationOverrides)),
      (client) => data.action === MARKET_SELECTION_ACTION
        ? executeSellerSpriteMarketSelection(client)
        : executeSellerSpriteKeywordProductResearch(client),
    )
    return { namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION, requestId, action: data.action, ok: true, data: result } satisfies SellerSpriteHtmlSessionSuccess
  } catch (error: unknown) {
    return targetClientError(requestId, error)
  }
}

const handlePingMessage = ({ data }: { data: unknown }): PingResponse => {
  if (!isPingRequest(data)) return invalidMessage()
  const response = {
    namespace: MESSAGE_NAMESPACE, kind: 'response', protocolVersion: PROTOCOL_VERSION,
    requestId: data.requestId, ok: true,
    data: {
      connected: true,
      extensionVersion: browser.runtime.getManifest().version,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: [...CAPABILITIES],
    },
  } satisfies PingResponse
  return response
}

const handleNativeRuntimeMessage = async (data: unknown): Promise<unknown> => {
  if (isPingRequest(data)) return handlePingMessage({ data })
  if (isTargetRequest(data)) return handleTargetMessage({ data })
  if (isSellerSpriteKeywordReverseRequest(data)) return handleKeywordReverseMessage({ data })
  if (isSellerSpriteMonthlyRequest(data)) return handleMonthlyMessage({ data })
  if (isSellerSpriteMarketResearchRequest(data)) return handleMarketResearchMessage({ data })
  if (isSellerSpriteAbaPeriodsRequest(data)) return handleAbaPeriodsMessage({ data })
  if (isSellerSpriteAbaResearchRequest(data)) return handleAbaResearchMessage({ data })
  if (isSellerSpriteCompetitorRequest(data)) return handleCompetitorMessage({ data })
  if (isSellerSpriteProductSelectionRequest(data)) return handleProductSelectionMessage({ data })
  if (isSellerSpriteCategoryNodesRequest(data)) return handleCategoryNodesMessage({ data })
  if (isSellerSpriteReviewCommentsRequest(data)) return handleReviewCommentsMessage({ data })
  if (isSellerSpriteKeywordMiningRequest(data)) return handleKeywordMiningMessage({ data })
  if (isSellerSpriteHtmlSessionRequest(data)) return handleHtmlSessionMessage({ data })
  return invalidMessage(requestIdOf(data))
}

export default defineBackground(() => {
  installWebTabRepair()

  // 侧边栏只能由 background 打开：sidePanel 在 content script 里不可用。
  registerOpenSidePanelHandler(browser)

  /**
   * 页面内浮层的提问从这里出去（#24）。
   *
   * 端点没有 CORS 头，amazon.com 页面上的内容脚本直连会被同源策略挡掉；manifest 里已经
   * 声明了这个域名的 host 权限，background 不受页面同源策略约束。给 Worker 加 CORS 的收益
   * 相同，却等于把这个端点对任意来源开放。
   */
  registerAnalysisAskRelay({ runtime: browser.runtime, fetch: (url, init) => fetch(url, init) })

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isExtensionRuntimeRequestEnvelope(message)) return false
    return handleNativeRuntimeMessage(message.request)
  })

  onMessage('PING', guarded(handlePingMessage))

  for (const action of TARGET_ACTIONS) onMessage(action, guarded(handleTargetMessage))
  onMessage(SELLERSPRITE_KEYWORD_REVERSE_ACTION, guarded(handleKeywordReverseMessage))
  onMessage(SELLERSPRITE_MONTHLY_ACTION, guarded(handleMonthlyMessage))
  onMessage(SELLERSPRITE_MARKET_RESEARCH_ACTION, guarded(handleMarketResearchMessage))
  onMessage(SELLERSPRITE_ABA_PERIODS_ACTION, guarded(handleAbaPeriodsMessage))
  onMessage(SELLERSPRITE_ABA_RESEARCH_ACTION, guarded(handleAbaResearchMessage))
  onMessage(COMPETITOR_RESEARCH_ACTION, guarded(handleCompetitorMessage))
  onMessage(PRODUCT_SELECTION_ACTION, guarded(handleProductSelectionMessage))
  onMessage(SELLERSPRITE_CATEGORY_NODES_ACTION, guarded(handleCategoryNodesMessage))
  onMessage(SELLERSPRITE_REVIEW_COMMENTS_ACTION, guarded(handleReviewCommentsMessage))
  onMessage(KEYWORD_MINING_ACTION, guarded(handleKeywordMiningMessage))
  onMessage(MARKET_SELECTION_ACTION, guarded(handleHtmlSessionMessage))
  onMessage(KEYWORD_PRODUCT_RESEARCH_ACTION, guarded(handleHtmlSessionMessage))
})

export { handleTargetMessage }
