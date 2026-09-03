import { ProductApiError, type PublicErrorEnvelope } from '../../shared/api/error'
import { fetchWithSessionRefresh, type AdminSession } from '../../shared/api/session'

export type ProfileKey = 'LLM_OPS' | 'NATURAL_CMS'
export type ProfileStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE'
export type ModelProvider = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE_GENAI'
export type ProviderCredentialState = 'STORED' | 'VERIFIED' | 'BILLING_BLOCKED' | 'INVALID_CREDENTIAL' | 'PROVIDER_UNAVAILABLE'
export type ProfileNodeType = 'start' | 'agent' | 'tool' | 'approval' | 'check' | 'guardrail' | 'end'

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

export interface ProfileSnapshotNode {
  id: string
  type: ProfileNodeType
  handlerKey: string
  resultPorts: string[]
  config: Record<string, unknown>
}

export interface ProfileSnapshotEdge {
  from: string
  resultPort: string
  to: string
}

export interface ProfileLoopLimit extends ProfileSnapshotEdge {
  maxIterations: number
}

export interface ProfileSnapshotConfig {
  maxNodes: number
  maxAttempts: number
  loopLimits: ProfileLoopLimit[]
}

export interface ProfileModelBinding {
  primary: string
  fallback: string[]
  selections?: Record<string, ProfileModelSelection>
}

export interface ProfileModelSelection {
  provider: ModelProvider
  model: string
  inference: {
    reasoningIntensity: string
    reasoningBudgetTokens?: number
  }
  [key: string]: unknown
}

export interface ModelCatalogModel {
  selectionId: string
  provider: ModelProvider
  model: string
  capabilities: string[]
  inference: {
    default: { reasoningIntensity: string; reasoningBudgetTokens: number | null }
    reasoningIntensity: string[]
    reasoningBudgetTokens: { min: number; max: number; multipleOf: number } | null
  }
}

export interface ModelCatalog {
  schemaVersion: '1.0'
  profileKey: ProfileKey
  models: ModelCatalogModel[]
}

export interface ProfileAuthoringSnapshot {
  nodes: ProfileSnapshotNode[]
  edges: ProfileSnapshotEdge[]
  config: ProfileSnapshotConfig
  modelBindings: Record<string, ProfileModelBinding>
  toolPolicy: { allowedTools: string[] }
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

export interface ProfileEditorLayoutNode {
  id: string
  x: number
  y: number
}

export interface ProfileEditorLayout {
  profileVersionId: string
  createdAt: string
  nodes: ProfileEditorLayoutNode[]
}

export interface ProfileDefaultTemplate {
  profileKey: ProfileKey
  updatedAt: string
  snapshot: ProfileAuthoringSnapshot
}

export interface ProfileVersionApiClient {
  list(profileKey?: ProfileKey): Promise<ProfileVersion[]>
  create(profileKey: ProfileKey, snapshot: ProfileAuthoringSnapshot): Promise<ProfileVersion>
  activate(profileVersionId: string): Promise<ProfileVersion>
}

export interface ProfileEditorLayoutApiClient {
  getEditorLayout(profileVersionId: string): Promise<ProfileEditorLayout>
  saveEditorLayout(profileVersionId: string, nodes: ProfileEditorLayoutNode[]): Promise<ProfileEditorLayout>
}

export interface ProfileDefaultTemplateApiClient {
  getDefaultTemplate(profileKey: ProfileKey): Promise<ProfileDefaultTemplate>
  saveDefaultTemplate(profileKey: ProfileKey, snapshot: ProfileAuthoringSnapshot): Promise<ProfileDefaultTemplate>
}

export interface ModelCatalogApiClient {
  listModelCatalog(profileKey: ProfileKey): Promise<ModelCatalog>
}

export interface AgentSettingsApiClient extends ProfileVersionApiClient, ProfileEditorLayoutApiClient, ProfileDefaultTemplateApiClient, ModelCatalogApiClient {
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

  getEditorLayout = (profileVersionId: string) => this.request<ProfileEditorLayout>(
    `/api/admin/ai/profile-versions/${encodeURIComponent(profileVersionId)}/editor-layout`,
  )

  saveEditorLayout = (profileVersionId: string, nodes: ProfileEditorLayoutNode[]) => this.request<ProfileEditorLayout>(
    `/api/admin/ai/profile-versions/${encodeURIComponent(profileVersionId)}/editor-layout`,
    { method: 'PUT', body: JSON.stringify({ nodes }) },
  )

  getDefaultTemplate = (profileKey: ProfileKey) => this.request<ProfileDefaultTemplate>(
    `/api/admin/ai/profile-templates/${encodeURIComponent(profileKey)}`,
  )

  saveDefaultTemplate = (profileKey: ProfileKey, snapshot: ProfileAuthoringSnapshot) => this.request<ProfileDefaultTemplate>(
    `/api/admin/ai/profile-templates/${encodeURIComponent(profileKey)}`,
    { method: 'PUT', body: JSON.stringify({ snapshot }) },
  )

  listModelCatalog = (profileKey: ProfileKey) => this.request<ModelCatalog>(
    `/api/admin/ai/model-catalog?profileKey=${encodeURIComponent(profileKey)}`,
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
