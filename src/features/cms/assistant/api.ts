import { ProductApiError } from '../../../shared/api/error'
import { fetchWithSessionRefresh, type AdminSession } from '../../../shared/api/session'

export const SCHEMA_VERSION = '1.0'

export type NaturalCmsResourceType = 'MENU' | 'BOARD' | 'CONTENT' | 'TEMPLATE'
export type NaturalCmsResource = { type: NaturalCmsResourceType; id: string }
export type NaturalCmsDecision = 'APPROVED' | 'REJECTED'

/** 서버가 돌려주는 Job 상태. 패널 상태 기계가 이 값을 따라간다. */
export type NaturalCmsJob = {
  schemaVersion: string
  jobId: string
  traceId: string
  profileVersionId: string
  pipelineAttempt: number
  stateVersion: number
  status: string
  requestText: string
  resource: NaturalCmsResource
  structuredCommand: unknown
  previewId: string | null
  previewHash: string | null
  previewValid: boolean
  approvalDecision: string | null
  approvalFeedback: string | null
  createdAt: string
  updatedAt: string
  /** 승인 ID/hash에 결합된 서버 저장본. 현재 폼 값으로 다시 만들지 않는다. */
  preview?: unknown
}

/**
 * 파이프라인이 막은 이유. Job 응답과 따로 받는다.
 *
 * Orchestrator 가 Job 응답을 허용 목록으로 검사해, 거기에 필드를 더하면 Job 전체가
 * `WORKER_RESPONSE_INVALID` 로 거부돼 파이프라인이 통째로 멎는다. 그래서 화면에만 필요한
 * 값은 이 경로로 받는다.
 *
 * 코드는 「관리자가 껐다」와 「지금 코드로도 안 된다」를 가르고, 사유는 모델이 쓴 한글
 * 문장이다. 둘 다 없으면 화면은 요청 문장을 보고 추측하던 예전 안내로 되돌아간다.
 */
export interface NaturalCmsRefusal {
  code: string | null
  reason: string | null
  /** 막힌 동작 키(`CREATE`·`UPDATE`·`DELETE`). 한글 라벨은 화면이 붙인다. */
  operations: string[]
}

type ProfileVersionSummary = { profileVersionId: string; profileKey: string; status: string }

/**
 * 패널에 남길 지난 요청 한 줄.
 *
 * 거버넌스 실행 이력을 그대로 쓴다. 패널이 따로 저장하지 않으므로 새로고침해도 남고,
 * 두 곳이 어긋날 일도 없다.
 */
export interface NaturalCmsRecord {
  jobId: string
  /** Job 상태 원본. 화면이 대기·멎음·승인·반려로 옮겨 부른다. */
  status: string
  requestText: string
  targetId: string
  updatedAt: string
}

/** 거버넌스 이력 한 줄. 자연어 CMS 외 다른 AI Job도 같은 모양으로 온다. */
type HistoryEntry = {
  domain: string
  kind: string
  title: string
  targetType: string
  targetId: string
  jobId: string | null
  status: string
  actorId: string | null
  updatedAt: string
}

/**
 * 한 번에 받아올 이력 수.
 *
 * 자연어 것만 남기고 다시 자르므로, 보여줄 개수보다 넉넉히 받아야 다섯 칸이 비지 않는다.
 */
const HISTORY_FETCH_LIMIT = 50

async function responseBody<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as {
      code?: string
      message?: string
      detail?: string
      error?: { code?: string; message?: string }
    }
    throw new ProductApiError({
      status: response.status,
      code: body.code ?? body.error?.code ?? `HTTP_${response.status}`,
      message: body.message ?? body.error?.message ?? body.detail ?? '자연어 요청을 처리하지 못했습니다.',
    })
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export class NaturalCmsApi {
  constructor(
    private token: string,
    private readonly onRefreshed: (session: AdminSession) => void,
    private readonly onExpired: () => void,
    /** 기록을 내 요청만으로 거르는 데 쓴다. 서버에는 작성자 필터가 없다. */
    private readonly actorId?: string,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    headers.set('X-Trace-Id', crypto.randomUUID())
    if (init.body !== undefined) headers.set('Content-Type', 'application/json')
    const response = await fetchWithSessionRefresh(path, { ...init, headers }, this.token, {
      onSessionRefreshed: (session) => { this.token = session.sessionToken; this.onRefreshed(session) },
      onSessionExpired: this.onExpired,
    })
    return responseBody<T>(response)
  }

  /** 활성 NATURAL_CMS Profile Version. Job 생성에 필요하다. */
  activeProfileVersionId = async () => {
    const versions = await this.request<ProfileVersionSummary[]>(
      '/api/admin/ai/profile-versions?profileKey=NATURAL_CMS',
    )
    const active = versions.find((version) => version.status === 'ACTIVE')
    if (!active) {
      throw new ProductApiError({
        status: 409,
        code: 'PROFILE_VERSION_NOT_ACTIVE',
        message: '활성화된 자연어 CMS Profile이 없습니다. AI 운영에서 Profile을 활성화해 주세요.',
      })
    }
    return active.profileVersionId
  }

  createJob = (value: { profileVersionId: string; requestText: string; resource: NaturalCmsResource }) =>
    this.request<NaturalCmsJob>('/api/natural-cms/jobs', {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...value }),
    })

  /** 진행 상태와 미리보기를 다시 읽는다. Job은 요청 직후 비어 있고 파이프라인이 채운다. */
  job = (jobId: string) =>
    this.request<NaturalCmsJob>(`/api/natural-cms/jobs/${encodeURIComponent(jobId)}`)

  /** 막힌 이유. Job 응답에 실을 수 없어 따로 받는다. 막히지 않았으면 둘 다 비어 온다. */
  refusal = (jobId: string) =>
    this.request<NaturalCmsRefusal>(
      `/api/natural-cms/jobs/${encodeURIComponent(jobId)}/refusal`)

  /**
   * 이 화면에서 내가 보낸 지난 요청.
   *
   * 이력 API는 자연어 CMS 말고 다른 AI Job도 함께 돌려주고 작성자 필터가 없다. 그래서
   * 걸러낸 뒤에 자른다. 순서를 바꾸면 남의 요청이 자리를 차지해 내 것이 밀려난다.
   */
  records = async (targetType: NaturalCmsResourceType, limit: number) => {
    const page = await this.request<{ items: HistoryEntry[] }>(
      `/api/admin/governance/runs?category=AI&limit=${HISTORY_FETCH_LIMIT}`)
    return page.items
      .filter((entry) => entry.domain === 'NATURAL_CMS'
        && entry.kind === 'NATURAL_CMS_JOB'
        && entry.targetType === targetType
        && entry.jobId !== null
        && (this.actorId === undefined || entry.actorId === this.actorId))
      .slice(0, limit)
      .map((entry): NaturalCmsRecord => ({
        jobId: entry.jobId as string,
        status: entry.status,
        requestText: entry.title,
        targetId: entry.targetId,
        updatedAt: entry.updatedAt,
      }))
  }

  /** 끝나지 않은 Job을 사유와 함께 닫는다. `AI05-021`이 만든 경로다. */
  cancel = (jobId: string, reason: string) =>
    this.request<NaturalCmsJob>(`/api/natural-cms/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, reason }),
    })

  decide = (jobId: string, value: {
    previewId: string
    previewHash: string
    decision: NaturalCmsDecision
    feedback?: string
  }) => this.request<NaturalCmsJob>(`/api/natural-cms/jobs/${encodeURIComponent(jobId)}/decisions`, {
    method: 'POST',
    body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...value }),
  })
}
