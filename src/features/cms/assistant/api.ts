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
}

type ProfileVersionSummary = { profileVersionId: string; profileKey: string; status: string }

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
