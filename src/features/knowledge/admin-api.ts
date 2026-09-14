import { ProductApiError, type PublicErrorEnvelope } from '../../shared/api/error'
import { fetchWithSessionRefresh, type AdminSession } from '../../shared/api/session'
import {
  ADMIN_SCHEMA_VERSION,
  type ActivationRequest,
  type ActivationRequestList,
  type AgentJob,
  type Connector,
  type ConnectorList,
  type ConnectorPreview,
  type CreateConnectorRequest,
  type KnowledgeBase,
  type KnowledgeTarget,
  type KnowledgeVersion,
  type KnowledgeVersionList,
  type Project,
  type TourDiagnosis,
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

  /**
   * 화면에서 감출 프로젝트 이름. **데이터는 그대로 두고 목록에서만 뺀다** — 삭제가 아니라
   * 표시 제외다(AI02-024).
   *
   * <p>UUID가 아니라 이름으로 거른다. UUID는 환경마다 다르게 생겨서 박아 두면 다른 환경에서
   * 엉뚱한 프로젝트가 사라진다. 이름은 없으면 아무것도 안 걸러지므로 화면이 달라지지 않는다.
   */
  private static readonly HIDDEN_PROJECT_NAMES: ReadonlySet<string> = new Set(['중기부 지원사업'])

  /**
   * 감춘 프로젝트는 드롭다운뿐 아니라 **대기 건수 뱃지에서도 빠져야 한다.** 두 화면이 같은
   * 목록을 봐야 "목록에 없는데 숫자에는 잡히는" 상태가 생기지 않으므로 여기 한 곳에서 거른다.
   */
  listProjects = async () => {
    const list = await this.request<{ items: Project[] }>('/api/projects')
    return { ...list, items: (list.items ?? []).filter((item) => !KnowledgeAdminApi.HIDDEN_PROJECT_NAMES.has(item.name)) }
  }

  /** `projectId`가 필수 파라미터다 — 전체 목록 엔드포인트가 없다. */
  listKnowledgeBases = (projectId: string) => this.request<{ items: KnowledgeBase[] }>(
    `/api/knowledge-bases?projectId=${encodeURIComponent(projectId)}`,
  )

  /**
   * 화면이 다룰 지식 베이스를 찾는다. 진입 시 1회, 폴링은 versions만 돌므로 반복 비용이 없다.
   *
   * <p>**여러 건이면 첫 번째를 고르지 않는다.** 조용히 고르면 잘못된 KB를 보고도 모른다.
   * 대신 후보를 그대로 돌려주고 화면이 고르게 한다.
   *
   * @param chosen URL 쿼리에서 온 선택값. 목록에 없으면 무시한다(다른 환경의 URL을 붙여넣는 경우).
   */
  resolveTarget = async (chosen: { projectId?: string; knowledgeBaseId?: string } = {}): Promise<KnowledgeTarget> => {
    const projects = (await this.listProjects()).items ?? []
    if (projects.length === 0) return { kind: 'empty', what: 'project' }

    const project = pick(projects, chosen.projectId, (item) => item.projectId)
    if (!project) return { kind: 'choose', what: 'project', projects }

    const bases = (await this.listKnowledgeBases(project.projectId)).items ?? []
    if (bases.length === 0) return { kind: 'empty', what: 'knowledgeBase', projects, project }

    const base = pick(bases, chosen.knowledgeBaseId, (item) => item.knowledgeBaseId)
    if (!base) return { kind: 'choose', what: 'knowledgeBase', projects, project, bases }

    return {
      kind: 'ready', projectId: project.projectId, knowledgeBaseId: base.knowledgeBaseId,
      name: base.name, projects, project, bases,
    }
  }

  /** A2 요약 · A5 목록 · 진행 중 감지가 전부 이 응답 하나를 쓴다. 진입 시 1회 호출. */
  listVersions = (knowledgeBaseId: string) => this.request<KnowledgeVersionList>(
    `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/versions`,
  )

  /** A3 진행 폴링. 진행 중 버전에 `buildJobId`가 있을 때만 쓴다. */
  getJob = (jobId: string) => this.request<AgentJob>(
    `/api/agent-jobs/${encodeURIComponent(jobId)}`,
  )

  /**
   * @param connectorVersionId BASE 원천 — 문서 집합을 만든다. 여기 없는 문서는 어디에도 없다.
   * @param overlayConnectorVersionIds 덧붙일 원천(최대 4). BASE가 만든 문서에 정보를 더한다.
   *     축제 행사일처럼 목록 API가 주지 않는 값이 이 경로로 들어온다. 계약상 선택 항목이라
   *     비었으면 아예 보내지 않는다 — 빈 배열을 보내도 같지만 요청이 전과 똑같아야 안전하다.
   */
  startBuild = (
    knowledgeBaseId: string, connectorVersionId: string, label?: string,
    overlayConnectorVersionIds: string[] = [],
  ) =>
    this.request<{ jobId: string; status: string; statusUrl: string }>(
      `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/versions`,
      {
        method: 'POST',
        body: JSON.stringify({
          schemaVersion: ADMIN_SCHEMA_VERSION, connectorVersionId, label,
          ...(overlayConnectorVersionIds.length > 0 ? { overlayConnectorVersionIds } : {}),
        }),
      },
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

  /**
   * 자료 갱신 요청. **쓰기 3종과 달리 SUPER_ADMIN 전용이 아니다** — 두 관리자 역할 모두
   * 남길 수 있다. 발견은 일반 관리자도 하고, 못 하는 것은 처리뿐이다.
   *
   * <p>`knowledgeVersionId`를 생략하면 "새로 만들어 달라"가 된다. 대상 버전이 아직 없는
   * 경우다. `request()`가 붙이는 `Idempotency-Key`는 서버가 요구하지 않지만 무해하다 —
   * 저장소가 "같은 사람 · 같은 대상 · 열린 요청"을 하나로 접으므로 재촉이 목록을 늘리지 않는다.
   */
  createActivationRequest = (knowledgeBaseId: string, body: { knowledgeVersionId?: string; reason?: string }) =>
    this.request<ActivationRequest>(
      `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/activation-requests`,
      { method: 'POST', body: JSON.stringify({ schemaVersion: ADMIN_SCHEMA_VERSION, ...body }) },
    )

  /** `OPEN`만 내려온다. 필터 파라미터가 없고, 처리된 요청은 서버가 알아서 뺀다. */
  listActivationRequests = (knowledgeBaseId: string) => this.request<ActivationRequestList>(
    `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/activation-requests`,
  )

  /** 전용 엔드포인트다. "구버전을 activate"가 아니다 — 대상은 ARCHIVED 또는 ACTIVE여야 한다. */
  rollback = (knowledgeBaseId: string, targetKnowledgeVersionId: string) =>
    this.request<KnowledgeVersion>(
      `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/rollback`,
      { method: 'POST', body: JSON.stringify({ schemaVersion: ADMIN_SCHEMA_VERSION, targetKnowledgeVersionId }) },
    )

  /** 프로젝트 단위 목록이다 — 전체 커넥터 엔드포인트가 없다. */
  listConnectors = (projectId: string) => this.request<ConnectorList>(
    `/api/projects/${encodeURIComponent(projectId)}/connectors`,
  )

  /**
   * 등록은 **Draft 커넥터 + 불변 버전**을 한 번에 만든다(201). 같은 이름으로 다시 등록하면
   * 기존 커넥터에 버전만 쌓이므로, 설정을 고치는 방법은 수정이 아니라 재등록이다.
   *
   * <p>실패는 대부분 **422**로 오고 사유가 응답 메시지에 그대로 들어 있다. 화면이 자체
   * 판정으로 막지 않고 서버 문장을 그대로 보이는 이유다.
   */
  createConnector = (projectId: string, request: CreateConnectorRequest) =>
    this.request<Connector>(
      `/api/projects/${encodeURIComponent(projectId)}/connectors`,
      { method: 'POST', body: JSON.stringify({ schemaVersion: ADMIN_SCHEMA_VERSION, ...request }) },
    )

  /** `maxItems`는 계약상 1~20이다. 넘기면 400이므로 화면이 먼저 자른다. */
  previewConnector = (connectorId: string, maxItems: number) =>
    this.request<ConnectorPreview>(
      `/api/connectors/${encodeURIComponent(connectorId)}/preview`,
      { method: 'POST', body: JSON.stringify({ schemaVersion: ADMIN_SCHEMA_VERSION, maxItems }) },
    )

  /**
   * 커넥터 버전 활성화. **지식 버전 활성화와 다른 엔드포인트다** — 이쪽은 "다음 빌드가 쓸
   * 자료원"을 정하고, 포털 답변은 지식 버전을 활성화해야 바뀐다.
   *
   * <p>`DRAFT`·`ACTIVE`만 받는다(`ConnectorStore:145`). 보관된 버전에 부르면 409
   * `CONNECTOR_VERSION_NOT_ACTIVATABLE`이다.
   */
  activateConnectorVersion = (connectorId: string, connectorVersionId: string) =>
    this.request<Connector>(
      `/api/connectors/${encodeURIComponent(connectorId)}/versions/${encodeURIComponent(connectorVersionId)}/activate`,
      { method: 'POST', body: JSON.stringify({ schemaVersion: ADMIN_SCHEMA_VERSION }) },
    )

  /* ----- 고객사 온보딩(AI02-017). 셋을 이어 불러 프로젝트·지식베이스·챗봇을 한 흐름으로 만든다. ----- */

  createProject = (name: string, description?: string) =>
    this.request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: ADMIN_SCHEMA_VERSION, name, ...(description ? { description } : {}) }),
    })

  createKnowledgeBase = (projectId: string, name: string) =>
    this.request<KnowledgeBase>('/api/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: ADMIN_SCHEMA_VERSION, projectId, name }),
    })

  createChatbot = (projectId: string, name: string, knowledgeBaseId: string) =>
    this.request<{ chatbotId: string }>(`/api/projects/${encodeURIComponent(projectId)}/chatbots`, {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: ADMIN_SCHEMA_VERSION, name, knowledgeBaseId }),
    })

  /**
   * 품질 진단 에이전트(AI02-027). **로컬 전용 통로다** — `/internal/dev`는 루프백과 CSRF로
   * 막혀 있고 `dev & local-full` 프로필에서만 산다. 공개 계약이 아니므로 다른 환경에서는
   * 404가 돌아오고, 화면은 그 404를 "이 환경에는 없는 기능"으로 읽는다.
   *
   * <p>CSRF 토큰은 같은 통로의 GET에서 받는다(provider-credentials 화면과 같은 방식).
   * 진단 자체가 모델을 여러 번 부르므로 30초 안팎이 걸린다 — 부르는 쪽이 기다림을 설계해야 한다.
   */
  diagnoseTourVersion = async (knowledgeBaseId: string, knowledgeVersionId: string) => {
    const { csrfToken } = await this.request<{ csrfToken: string }>(
      `/internal/dev/evaluation-sets/${encodeURIComponent(knowledgeBaseId)}`,
    )
    return this.request<TourDiagnosis>(
      `/internal/dev/tour-diagnosis/${encodeURIComponent(knowledgeVersionId)}`,
      { method: 'POST', headers: { 'X-AXMS-CSRF': csrfToken }, body: '{}' },
    )
  }
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

/**
 * 1건이면 자동 선택, 여러 건이면 명시적으로 고른 것만 쓴다.
 *
 * <p>고른 값이 목록에 없으면 `undefined`를 준다 — 다른 환경에서 만들어진 URL을 붙여넣었을 때
 * 엉뚱한 대상을 조용히 잡지 않기 위해서다.
 */
function pick<T>(items: T[], chosenId: string | undefined, idOf: (item: T) => string): T | undefined {
  if (items.length === 1) return items[0]
  return chosenId ? items.find((item) => idOf(item) === chosenId) : undefined
}
