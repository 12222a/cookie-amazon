import { describe, expect, it } from 'vitest'
import { SELLERSPRITE_TARGET_ID } from '@cookie-amazon/sellersprite'
import { isValidTargetAdapter } from '../adapter'
import { AMAZON_ADAPTER, AMAZON_ORIGIN, AMAZON_TARGET_ID } from '../amazon'
import { TARGET_REGISTRY } from '../registry'

describe('amazon target', () => {
  it('is registered as its own target with a stable id and origin', () => {
    expect(AMAZON_TARGET_ID).toBe('amazon')
    expect(AMAZON_ORIGIN).toBe('https://www.amazon.com')
    expect(AMAZON_ADAPTER.permissionOrigins).toEqual(['https://www.amazon.com/*'])
    expect(TARGET_REGISTRY.get(AMAZON_TARGET_ID)).toBe(AMAZON_ADAPTER)
  })

  it('is a valid adapter that issues no HTTP operations of its own', () => {
    expect(isValidTargetAdapter(AMAZON_ADAPTER)).toBe(true)
    expect(Object.values(AMAZON_ADAPTER.operations).every((policy) => policy.enabled === false)).toBe(true)
  })

  it('keeps a policy for every operation the type allows, sellersprite included', () => {
    const sellersprite = TARGET_REGISTRY.get(SELLERSPRITE_TARGET_ID)
    expect(sellersprite).toBeDefined()
    expect(Object.keys(AMAZON_ADAPTER.operations).sort()).toEqual(Object.keys(sellersprite!.operations).sort())
  })
})
