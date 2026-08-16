import { describe, expect, it } from 'vitest'
import { WebSdkError } from '../errors'

describe('web-sdk errors', () => {
  it('exposes stable error codes', () => {
    expect(new WebSdkError('TIMEOUT').code).toBe('TIMEOUT')
  })
})