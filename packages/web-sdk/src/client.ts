import { sendMessage, setNamespace } from 'webext-bridge/window'
import {
  createPingRequest,
  createTargetRequest,
  isAllowedWebOrigin,
  isPingResponse,
  isTargetResponse,
  MESSAGE_NAMESPACE,
  type ExtensionStatus,
  type PingRequest,
  type TargetAction,
  type TargetDescriptor,
  type TargetListData,
  type TargetLoginData,
  type TargetPermissionData,
  type TargetProfileData,
  type TargetRequest,
  type TargetStatusData,
} from '@cookie-amazon/protocol'
import { WebSdkError } from './errors'

export type WebSdkOptions = { timeoutMs?: number }
const DEFAULT_TIMEOUT_MS = 1500
let initialized = false

const createRequestId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2)}`
const initializeBridge = (): void => {
  if (initialized) return
  setNamespace(MESSAGE_NAMESPACE)
  initialized = true
}

const requestWithTimeout = async (
  action: string,
  request: PingRequest | TargetRequest,
  timeoutMs: number,
): Promise<unknown> => {
  let timeoutId: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new WebSdkError('TIMEOUT')), timeoutMs)
  })
  try {
    return await Promise.race([
      sendMessage(action, request, 'content-script') as Promise<unknown>,
      timeout,
    ])
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
}

export const ping = async (options: WebSdkOptions = {}): Promise<ExtensionStatus> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  initializeBridge()
  const request = createPingRequest(createRequestId())
  try {
    const response = await requestWithTimeout('PING', request, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    if (!isPingResponse(response)) throw new WebSdkError('INVALID_MESSAGE')
    if (!response.ok) throw new WebSdkError(response.error.code)
    return response.data
  } catch (error: unknown) {
    if (error instanceof WebSdkError) throw error
    throw new WebSdkError('EXTENSION_UNAVAILABLE')
  }
}

const sendTargetRequest = async <T>(
  action: TargetAction,
  targetId: string | undefined,
  options: WebSdkOptions,
): Promise<T> => {
  if (!isAllowedWebOrigin(window.location.origin)) throw new WebSdkError('INVALID_ORIGIN')
  initializeBridge()
  const request = createTargetRequest(action, createRequestId(), targetId)
  try {
    const response = await requestWithTimeout(action, request, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    if (!isTargetResponse(response)) throw new WebSdkError('INVALID_MESSAGE')
    if (!response.ok) throw new WebSdkError(response.error.code)
    return response.data as T
  } catch (error: unknown) {
    if (error instanceof WebSdkError) throw error
    throw new WebSdkError('EXTENSION_UNAVAILABLE')
  }
}

export const listTargets = async (options: WebSdkOptions = {}): Promise<TargetListData['targets']> =>
  (await sendTargetRequest<TargetListData>('LIST_TARGETS', undefined, options)).targets

export const getTargetStatus = async (targetId: string, options: WebSdkOptions = {}): Promise<TargetStatusData> =>
  sendTargetRequest<TargetStatusData>('GET_TARGET_STATUS', targetId, options)

export const requestTargetPermission = async (targetId: string, options: WebSdkOptions = {}): Promise<TargetPermissionData> =>
  sendTargetRequest<TargetPermissionData>('REQUEST_TARGET_PERMISSION', targetId, options)

export const removeTargetPermission = async (targetId: string, options: WebSdkOptions = {}): Promise<TargetPermissionData> =>
  sendTargetRequest<TargetPermissionData>('REMOVE_TARGET_PERMISSION', targetId, options)

export const checkLogin = async (targetId: string, options: WebSdkOptions = {}): Promise<TargetLoginData> =>
  sendTargetRequest<TargetLoginData>('CHECK_LOGIN', targetId, options)

export const getProfile = async (targetId: string, options: WebSdkOptions = {}): Promise<TargetProfileData> =>
  sendTargetRequest<TargetProfileData>('GET_PROFILE', targetId, options)

export const getExtensionStatus = ping
export type { TargetDescriptor }