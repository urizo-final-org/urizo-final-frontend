import { ProductApiError, type PublicErrorEnvelope } from '../../shared/api/error'
import { fetchWithSessionRefresh, type AdminSession } from '../../shared/api/session'

export type ProfileKey = 'LLM_OPS' | 'NATURAL_CMS'
export type ProfileStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE'
export type ModelProvider = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE_GENAI'
export type ProviderCredentialState = 'STORED' | 'VERIFIED' | 'BILLING_BLOCKED' | 'INVALID_CREDENTIAL' | 'PROVIDER_UNAVAILABLE'

export interface ProviderCredentialStatus {
  provider: ModelProvider
  configured: boolean
  state: ProviderCredentialState | null
  fingerprintSuffix: string | null
  updatedAt: string | null
  lastTestedAt: string | null
}

export interface ProviderCredentialOverview {
  csrfToken: string
  providers: ProviderCredentialStatus[]
  checkedAt: string
}

export interface ProviderConnectionTestResult {
  provider: ModelProvider
  modelId: string
  state: ProviderCredentialState
  inferenceExecuted: boolean
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  testedAt: string
  safeCode: string
}

export interface ProfileAuthoringSnapshot {
  nodes: unknown[]
  edges: unknown[]
  config: Record<string, unknown>
  modelBindings: Record<string, unknown>
  toolPolicy: Record<string, unknown>
  guardrailProfileKey: string
}

export interface VersionedProfileSnapshot extends ProfileAuthoringSnapshot {
  contractVersion: '1.0'
  profileVersionId: string
  profileKey: ProfileKey
  profileVersion: number
}

export interface ProfileVersion {
  profileVersionId: string
  profileKey: ProfileKey
  profileVersion: number
  status: ProfileStatus
  createdAt: string
  snapshot: VersionedProfileSnapshot
}

export interface ProfileVersionApiClient {
  list(profileKey?: ProfileKey): Promise<ProfileVersion[]>
  create(profileKey: ProfileKey, snapshot: ProfileAuthoringSnapshot): Promise<ProfileVersion>
  activate(profileVersionId: string): Promise<ProfileVersion>
}

export interface AgentSettingsApiClient extends ProfileVersionApiClient {
  listProviderCredentials(): Promise<ProviderCredentialOverview>
  storeProviderCredential(provider: ModelProvider, credential: string, csrfToken: string): Promise<ProviderCredentialStatus>
  testProviderCredential(provider: ModelProvider, csrfToken: string): Promise<ProviderConnectionTestResult>
  deleteProviderCredential(provider: ModelProvider, csrfToken: string): Promise<ProviderCredentialStatus>
}

async function responseBody<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as PublicErrorEnvelope
    throw new ProductApiError({
      status: response.status,
      code: body.error?.code ?? body.code ?? `HTTP_${response.status}`,
      message: body.error?.message ?? body.message ?? 'Profile Version 요청을 처리하지 못했습니다.',
      traceId: body.traceId,
      retryable: body.error?.retryable,
      retryAfterMs: body.error?.retryAfterMs,
    })
  }
  return response.json() as Promise<T>
}

export class ProfileVersionApi implements AgentSettingsApiClient {
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
      onSessionRefreshed: (session) => {
        this.token = session.sessionToken
        this.onRefreshed(session)
      },
      onSessionExpired: this.onExpired,
    })
    return responseBody<T>(response)
  }

  list = (profileKey?: ProfileKey) => this.request<ProfileVersion[]>(
    `/api/admin/ai/profile-versions${profileKey ? `?profileKey=${encodeURIComponent(profileKey)}` : ''}`,
  )

  create = (profileKey: ProfileKey, snapshot: ProfileAuthoringSnapshot) => this.request<ProfileVersion>(
    '/api/admin/ai/profile-versions',
    { method: 'POST', body: JSON.stringify({ profileKey, snapshot }) },
  )

  activate = (profileVersionId: string) => this.request<ProfileVersion>(
    `/api/admin/ai/profile-versions/${encodeURIComponent(profileVersionId)}/activate`,
    { method: 'POST' },
  )

  listProviderCredentials = () => this.request<ProviderCredentialOverview>(
    '/internal/dev/provider-credentials',
  )

  storeProviderCredential = (provider: ModelProvider, credential: string, csrfToken: string) => this.request<ProviderCredentialStatus>(
    `/internal/dev/provider-credentials/${encodeURIComponent(provider)}`,
    { method: 'PUT', headers: { 'X-AXMS-CSRF': csrfToken }, body: JSON.stringify({ credential }) },
  )

  testProviderCredential = (provider: ModelProvider, csrfToken: string) => this.request<ProviderConnectionTestResult>(
    `/internal/dev/provider-credentials/${encodeURIComponent(provider)}/test`,
    { method: 'POST', headers: { 'X-AXMS-CSRF': csrfToken } },
  )

  deleteProviderCredential = (provider: ModelProvider, csrfToken: string) => this.request<ProviderCredentialStatus>(
    `/internal/dev/provider-credentials/${encodeURIComponent(provider)}`,
    { method: 'DELETE', headers: { 'X-AXMS-CSRF': csrfToken } },
  )
}
