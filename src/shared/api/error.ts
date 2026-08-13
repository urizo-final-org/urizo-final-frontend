export interface PublicErrorEnvelope {
  traceId?: string
  error?: {
    code?: string
    message?: string
    retryable?: boolean
    retryAfterMs?: number
  }
  code?: string
  message?: string
}

export class ProductApiError extends Error {
  readonly status: number
  readonly code: string
  readonly traceId?: string
  readonly retryable: boolean
  readonly retryAfterMs?: number

  constructor(options: {
    status: number
    code: string
    message: string
    traceId?: string
    retryable?: boolean
    retryAfterMs?: number
  }) {
    super(options.message)
    this.name = 'ProductApiError'
    this.status = options.status
    this.code = options.code
    this.traceId = options.traceId
    this.retryable = options.retryable ?? false
    this.retryAfterMs = options.retryAfterMs
  }
}

export function describeFailure(failure: unknown): string {
  if (failure instanceof ProductApiError) {
    const trace = failure.traceId ? ` · trace ${failure.traceId.slice(0, 8)}` : ''
    return `${failure.message} [${failure.code}]${trace}`
  }
  return failure instanceof Error ? failure.message : '알 수 없는 오류가 발생했습니다.'
}
