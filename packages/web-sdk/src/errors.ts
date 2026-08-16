import type { ProtocolErrorCode } from '@cookie-amazon/protocol'

export class WebSdkError extends Error {
  readonly code: ProtocolErrorCode

  constructor(code: ProtocolErrorCode) {
    super(code)
    this.name = 'WebSdkError'
    this.code = code
  }
}