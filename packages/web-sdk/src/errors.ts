import type { ProtocolErrorCode } from '@cookie-amazon/protocol'

export class WebSdkError extends Error {
  readonly code: ProtocolErrorCode
  readonly targetCode?: string | number
  readonly targetMessage?: string

  constructor(
    code: ProtocolErrorCode,
    details: { targetCode?: string | number; targetMessage?: string } = {},
  ) {
    super(details.targetMessage ?? code)
    this.name = 'WebSdkError'
    this.code = code
    this.targetCode = details.targetCode
    this.targetMessage = details.targetMessage
  }
}