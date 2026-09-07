import { ProductApiError, type PublicErrorEnvelope } from '../../shared/api/error'
import type { PublicChatRequest, PublicChatResponse } from './types'

/**
 * 공개 RAG 클라이언트(무인증). A(검색)·B(챗봇)가 같은 엔드포인트 하나를 쓴다.
 *
 * <p>`shared/api/http.ts`·`session.ts`를 쓰지 않는다 — 그쪽은 401에서 refresh 후 재시도하므로
 * 비로그인 방문자가 챗봇을 쓸 때 쓸모없는 refresh를 타게 된다. 무인증 패턴은 `cms/api.ts`의
 * `SiteApi`와 같고 파일 위치만 AGENTS.md가 지정한 `features/knowledge/`다.
 *
 * <p>`Idempotency-Key`와 본문 `schemaVersion`은 넣지 않는다(공개 경로는 둘 다 불요).
 * `topK`는 서버가 받지 않는다 — 공개 호출자가 검색 폭을 못 늘리게 한 의도적 제외다.
 *
 * <p>TODO: S1(I5 배포) 후 실호출 1회로 검증한다. 지금은 `/api/public/**`가 SecurityConfig
 * 규칙에 없어 401 `AUTHENTICATION_REQUIRED`가 돌아온다 — 이 파일은 미검증이다.
 */
const PUBLIC_CHAT_QUERY = '/api/public/chat/query'

export async function queryPublicChat(
  request: PublicChatRequest,
  signal?: AbortSignal,
): Promise<PublicChatResponse> {
  const response = await fetch(PUBLIC_CHAT_QUERY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: request.query,
      conversationId: request.conversationId ?? null,
      ...(request.category?.length ? { category: request.category } : {}),
    }),
    cache: 'no-store',
    signal,
  })
  const body = await response.json().catch(() => undefined)
  if (!response.ok) throw toProductApiError(response.status, body)
  return body as PublicChatResponse
}

/**
 * 공개/제품 경로는 `{ traceId, error: { code, message, retryable, retryAfterMs } }` 봉투를 쓴다.
 * 같은 화면이 함께 쓰는 `/api/site/**`는 RFC 7807이라 `traceId`가 없다 — 없으면 없는 대로 둔다.
 */
function toProductApiError(status: number, body: unknown): ProductApiError {
  const envelope = (body ?? {}) as PublicErrorEnvelope & { detail?: string; title?: string }
  return new ProductApiError({
    status,
    code: envelope.error?.code ?? envelope.code ?? `HTTP_${status}`,
    message: envelope.error?.message ?? envelope.detail ?? envelope.message ?? envelope.title ?? '요청을 처리하지 못했습니다.',
    traceId: envelope.traceId,
    retryable: envelope.error?.retryable,
    retryAfterMs: envelope.error?.retryAfterMs,
  })
}
