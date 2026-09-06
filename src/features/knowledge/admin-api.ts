import { ProductApiError, type PublicErrorEnvelope } from '../../shared/api/error'
import { fetchWithSessionRefresh, type AdminSession } from '../../shared/api/session'
import {
  ADMIN_SCHEMA_VERSION,
  type AgentJob,
  type KnowledgeVersion,
  type KnowledgeVersionList,
} from './admin-types'

/**
 * 관리자 RAG 클라이언트(인증). 공개 클라이언트(`public-api.ts`)와 달리 **`shared/api/http.ts`
 * 경로를 쓴다** — 401 → refresh → 재시도가 여기서는 옳다(로그인한 관리자이므로).
 *
 * <p>쓰기 4종이 공통으로 요구하는 것 둘. 9/6 실호출에서 둘 다 400으로 걸렸다.
 * <ul>
 *   <li>**`Idempotency-Key` 헤더** — 빌드·활성화·롤백뿐 아니라 **`/api/auth/login`도 요구한다**
 *   <li>**본문 `schemaVersion: "1.0"`** — 불일치 시 400
 * </ul>
 *
 * <p>토큰 필드는 `accessToken`이 아니라 **`sessionToken`**이다(`LoginResponse:9`).
 */

/** 서버 CHECK가 요구하는 형식: `^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$`. UUID가 그대로 맞는다. */
function idempotencyKey(): string {
  return crypto.randomUUID()
}

export class KnowledgeAdminApi {
  constructor(
    private token: string,
    private readonly onRefreshed: (session: AdminSession) => void,
    private readonly onExpired: () => void,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    headers.set('X-Trace-Id', crypto.randomUUID())
    if (init.body !== undefined) {
      headers.set('Content-Type', 'application/json')
      headers.set('Idempotency-Key', idempotencyKey())
    }
    const response = await fetchWithSessionRefresh(path, { ...init, headers }, this.token, {
      onSessionRefreshed: (session) => {
        this.token = session.sessionToken
        this.onRefreshed(session)
      },
      onSessionExpired: this.onExpired,
    })
    const body = await response.json().catch(() => undefined)
    if (!response.ok) throw toProductApiError(response.status, body)
    return body as T
  }

  /** A2 요약 · A5 목록 · 진행 중 감지가 전부 이 응답 하나를 쓴다. 진입 시 1회 호출. */
  listVersions = (knowledgeBaseId: string) => this.request<KnowledgeVersionList>(
    `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/versions`,
  )

  /** A3 진행 폴링. 진행 중 버전에 `buildJobId`가 있을 때만 쓴다. */
  getJob = (jobId: string) => this.request<AgentJob>(
    `/api/agent-jobs/${encodeURIComponent(jobId)}`,
  )

  startBuild = (knowledgeBaseId: string, connectorVersionId: string, label?: string) =>
    this.request<{ jobId: string; status: string; statusUrl: string }>(
      `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/versions`,
      { method: 'POST', body: JSON.stringify({ schemaVersion: ADMIN_SCHEMA_VERSION, connectorVersionId, label }) },
    )

  /**
   * 활성화가 곧 승인이다. 별도 `/approve` 엔드포인트는 없고, `APPROVAL_PENDING` 또는
   * `ACTIVE`에서만 허용된다(그 외에는 409 `KNOWLEDGE_VERSION_NOT_APPROVABLE`).
   *
   * <p>`expectedStateVersion`은 **빌드 Job의 `stateVersion`**이다 — 1로 넣으면
   * `JOB_STATE_CONFLICT`가 난다(함정 3). 생략하면 서버가 검사하지 않는다.
   */
  activate = (knowledgeVersionId: string, expectedStateVersion?: number) =>
    this.request<KnowledgeVersion>(
      `/api/knowledge-versions/${encodeURIComponent(knowledgeVersionId)}/activate`,
      { method: 'POST', body: JSON.stringify({ schemaVersion: ADMIN_SCHEMA_VERSION, expectedStateVersion }) },
    )

  /** 전용 엔드포인트다. "구버전을 activate"가 아니다 — 대상은 ARCHIVED 또는 ACTIVE여야 한다. */
  rollback = (knowledgeBaseId: string, targetKnowledgeVersionId: string) =>
    this.request<KnowledgeVersion>(
      `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/rollback`,
      { method: 'POST', body: JSON.stringify({ schemaVersion: ADMIN_SCHEMA_VERSION, targetKnowledgeVersionId }) },
    )
}

/** 제품 경로는 `{ traceId, error: { code, message, retryable, retryAfterMs } }` 봉투를 쓴다. */
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
