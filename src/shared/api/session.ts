import { ProductApiError, type PublicErrorEnvelope } from './error'
import { asRecord, defaultFetcher, parseBody, type Fetcher, type Uuid } from './http'

export interface ProductSession {
  bearerToken: string
  actorId?: Uuid
  expiresAt?: string
}

export async function fetchProductSession(fetcher: Fetcher = defaultFetcher): Promise<ProductSession> {
  const response = await fetcher('/internal/dev/product-session', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const body = asRecord(await parseBody(response))
  if (!response.ok) {
    const envelope = body as PublicErrorEnvelope
    throw new ProductApiError({
      status: response.status,
      code: envelope.error?.code ?? envelope.code ?? 'PRODUCT_SESSION_UNAVAILABLE',
      message: envelope.error?.message ?? envelope.message ?? '로컬 제품 세션을 가져올 수 없습니다.',
      traceId: envelope.traceId,
    })
  }

  const token = body.bearerToken ?? body.accessToken ?? body.token
  if (typeof token !== 'string' || token.length < 8) {
    throw new ProductApiError({
      status: 500,
      code: 'PRODUCT_SESSION_INVALID',
      message: '로컬 제품 세션 응답에 사용할 수 있는 Bearer token이 없습니다.',
    })
  }

  return {
    bearerToken: token,
    actorId: typeof body.actorId === 'string' ? body.actorId : undefined,
    expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : undefined,
  }
}
