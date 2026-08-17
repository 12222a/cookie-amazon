import { describe, expect, it } from 'vitest'
import {
  SELLERSPRITE_API_ERROR_CODES,
  SELLERSPRITE_API_ORIGIN,
  SELLERSPRITE_CAPABILITY_IDS,
  SELLERSPRITE_KEYWORD_MINING_API,
  SELLERSPRITE_ORIGIN,
  SELLERSPRITE_PERMISSION_ORIGIN,
  SELLERSPRITE_REVERSE_ASIN_API,
  SELLERSPRITE_WEB_CAPABILITY_CONTRACTS,
  getSellerSpriteCapability,
  getSellerSpriteTargetMetadata,
  isSellerSpriteCapabilityId,
  listSellerSpriteCapabilities,
} from '../index'

describe('SellerSprite capability catalog', () => {
  it('registers the requested capabilities with stable ids', () => {
    const capabilities = listSellerSpriteCapabilities()

    expect(capabilities.map(({ id }) => id)).toEqual([...SELLERSPRITE_CAPABILITY_IDS])
    expect(new Set(capabilities.map(({ id }) => id)).size).toBe(capabilities.length)
    expect(capabilities.map(({ displayName }) => displayName)).toEqual([
      '登录状态检测',
      '关键词反查',
      '查竞品',
      '选产品',
      '选市场',
      '关键词选品',
      '关键词挖掘',
    ])
  })

  it('validates ids and resolves only registered capabilities', () => {
    expect(isSellerSpriteCapabilityId('KEYWORD_MINING')).toBe(true)
    expect(isSellerSpriteCapabilityId('UNKNOWN_OPERATION')).toBe(false)
    expect(getSellerSpriteCapability('COMPETITOR_RESEARCH')?.category).toBe('competitor')
    expect(getSellerSpriteCapability('UNKNOWN_OPERATION')).toBeUndefined()
  })

  it('freezes the confirmed official API contracts without storing credentials', () => {
    expect(SELLERSPRITE_API_ORIGIN).toBe('https://api.sellersprite.com')
    expect(SELLERSPRITE_REVERSE_ASIN_API).toEqual({
      origin: SELLERSPRITE_API_ORIGIN,
      method: 'POST',
      path: '/v1/traffic/keyword',
    })
    expect(SELLERSPRITE_KEYWORD_MINING_API).toEqual({
      origin: SELLERSPRITE_API_ORIGIN,
      method: 'GET',
      path: '/v1/keyword/miner',
    })
    expect(SELLERSPRITE_API_ERROR_CODES).toContain('ERROR_SECRET_KEY')
    expect(SELLERSPRITE_API_ERROR_CODES).toContain('ERROR_VISIT_MAX')
    expect(JSON.stringify(SELLERSPRITE_REVERSE_ASIN_API)).not.toContain('secret')
    expect(JSON.stringify(SELLERSPRITE_KEYWORD_MINING_API)).not.toContain('secret')
  })

  it('freezes confirmed web contracts without storing credentials', () => {
    expect(SELLERSPRITE_WEB_CAPABILITY_CONTRACTS.map(({ capabilityId }) => capabilityId)).toEqual([
      ...SELLERSPRITE_CAPABILITY_IDS,
    ])
    expect(SELLERSPRITE_WEB_CAPABILITY_CONTRACTS.every(({ origin, status, authMode, endpoints }) =>
      origin === SELLERSPRITE_ORIGIN
      && status === 'web-endpoint-confirmed'
      && authMode === 'browser-cookie-automatic'
      && endpoints.length > 0,
    )).toBe(true)
    expect(SELLERSPRITE_WEB_CAPABILITY_CONTRACTS.find(({ capabilityId }) => capabilityId === 'CHECK_LOGIN')?.endpoints).toEqual([
      { path: '/v2/me', method: 'GET', responseKind: 'html' },
    ])
    expect(SELLERSPRITE_WEB_CAPABILITY_CONTRACTS.find(({ capabilityId }) => capabilityId === 'KEYWORD_MINING')?.endpoints.map(({ path }) => path)).toEqual([
      '/v3/api/keyword-miner',
      '/v3/api/keyword-miner/high/frequency-new',
      '/v3/api/keyword-miner/deleted/keyword/list',
      '/v3/api/suggestions',
    ])
    const serialized = JSON.stringify(SELLERSPRITE_WEB_CAPABILITY_CONTRACTS)
    expect(serialized).not.toContain('secret-key')
    expect(serialized).not.toContain('authorization')
    expect(serialized).not.toContain('cookie:')
  })

  it('keeps the target origin and permission scope fixed', () => {
    const metadata = getSellerSpriteTargetMetadata()

    expect(metadata.origin).toBe(SELLERSPRITE_ORIGIN)
    expect(metadata.permissionOrigin).toBe(SELLERSPRITE_PERMISSION_ORIGIN)
    expect(metadata.capabilityIds).toEqual([...SELLERSPRITE_CAPABILITY_IDS])
    expect(metadata.origin).not.toContain('*')
    expect(metadata.permissionOrigin).toBe(`${metadata.origin}/*`)
  })

  it('exposes immutable catalog data and marks contracts as confirmed', () => {
    const capabilities = listSellerSpriteCapabilities()
    const metadata = getSellerSpriteTargetMetadata()

    expect(Object.isFrozen(capabilities)).toBe(true)
    expect(Object.isFrozen(metadata)).toBe(true)
    expect(Object.isFrozen(metadata.capabilityIds)).toBe(true)
    for (const capability of capabilities) {
      expect(Object.isFrozen(capability)).toBe(true)
      expect(capability.contractStatus).toBe('contract-confirmed')
      expect('endpoint' in capability).toBe(false)
    }
  })
})