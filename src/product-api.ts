export const SCHEMA_VERSION = '1.0' as const

export type Uuid = string

export interface ProductSession {
  bearerToken: string
  actorId?: Uuid
  expiresAt?: string
}

export interface HealthResponse {
  schemaVersion: typeof SCHEMA_VERSION
  traceId: Uuid
  status: 'UP'
  checkedAt: string
}

export interface ReadinessCheck {
  name: string
  status: 'UP' | 'DOWN' | 'NOT_CONFIGURED'
  required: boolean
}

export interface ReadinessResponse {
  schemaVersion: typeof SCHEMA_VERSION
  traceId: Uuid
  status: 'READY' | 'NOT_READY'
  checkedAt: string
  checks: ReadinessCheck[]
}

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION
  traceId: Uuid
  projectId: Uuid
  name: string
  description?: string
  status: 'ACTIVE' | 'ARCHIVED'
  createdAt: string
  updatedAt?: string
}

export interface CreateProjectInput {
  name: string
  description?: string
}

export type ConnectorStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'FAILED'

export interface Connector {
  schemaVersion: typeof SCHEMA_VERSION
  traceId: Uuid
  projectId: Uuid
  connectorId: Uuid
  connectorVersionId: Uuid
  activeVersionId?: Uuid | null
  name: string
  status: ConnectorStatus
  configDigest: string
  createdAt: string
  updatedAt?: string
}

export interface ConnectorAuthentication {
  type: 'API_KEY'
  location: 'QUERY' | 'HEADER'
  name: string
  secretRef: string
}

export interface ConnectorRequestParameter {
  name: string
  type: 'STRING' | 'INTEGER' | 'NUMBER' | 'BOOLEAN'
  required: boolean
  description?: string
  defaultValue?: string | number | boolean
}

export interface CreateConnectorInput {
  name: string
  baseUrl: string
  endpoint: string
  method: 'GET'
  authentication: ConnectorAuthentication
  requestParameters: ConnectorRequestParameter[]
  response: {
    successCodePath?: string
    successValues?: Array<string | number>
    itemsPath: string
    totalCountPath?: string
  }
  pagination: {
    type: 'PAGE'
    pageParameter: string
    pageSizeParameter: string
    startPage: number
    pageSize: number
  }
  documentMapping: {
    documentId: string
    title: string
    content: string
    category?: string
    sourceUpdatedAt?: string
    sourceUrl?: string
    metadata?: Record<string, string>
  }
}

export interface PreviewDocument {
  documentId: string
  title: string
  content: string
  category?: string[]
  sourceUrl?: string
  sourceUpdatedAt?: string
}

export interface ConnectorPreview {
  schemaVersion: typeof SCHEMA_VERSION
  traceId: Uuid
  connectorId: Uuid
  itemCount: number
  totalCount?: number
  documents: PreviewDocument[]
  truncated: boolean
  checkedAt: string
}

export interface AcceptedJob {
  schemaVersion: typeof SCHEMA_VERSION
  traceId: Uuid
  jobId: Uuid
  jobType: JobType
  status: 'QUEUED'
  statusUrl: string
  acceptedAt: string
  knowledgeVersionId?: Uuid
  connectorVersionId?: Uuid
  configDigest?: string
}

export interface KnowledgeBase {
  schemaVersion: typeof SCHEMA_VERSION
  traceId: Uuid
  knowledgeBaseId: Uuid
  projectId: Uuid
  name: string
  description?: string
  activeVersionId: Uuid | null
  createdAt: string
  updatedAt?: string
}

export type KnowledgeVersionStatus =
  | 'BUILD_REQUESTED'
  | 'BUILDING'
  | 'APPROVAL_PENDING'
  | 'ACTIVE'
  | 'ARCHIVED'
  | 'FAILED'

export interface KnowledgeVersion {
  schemaVersion: typeof SCHEMA_VERSION
  traceId: Uuid
  knowledgeVersionId: Uuid
  knowledgeBaseId: Uuid
  connectorVersionId: Uuid
  label?: string
  status: KnowledgeVersionStatus
  configDigest?: string
  createdAt: string
  updatedAt?: string
  activatedAt?: string
}

export interface Chatbot {
  schemaVersion: typeof SCHEMA_VERSION
  traceId: Uuid
  chatbotId: Uuid
  projectId: Uuid
  knowledgeBaseId: Uuid
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
  updatedAt?: string
}

export type JobType = 'CONNECTOR_SYNC' | 'KNOWLEDGE_BUILD'
export type JobStatus = 'QUEUED' | 'RUNNING' | 'WAITING_APPROVAL' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export interface JobProgress {
  phase?: 'COLLECT' | 'NORMALIZE' | 'CHUNK' | 'EMBED' | 'INDEX' | 'EVALUATE' | 'APPROVAL_PENDING'
  percent: number
  targetCount?: number
  successCount?: number
  failedCount?: number
}

export interface JobFailure {
  code: string
  message: string
  retryable: boolean
  retryAfterMs?: number
}

export interface AgentJob {
  schemaVersion: typeof SCHEMA_VERSION
  traceId: Uuid
  jobId: Uuid
  projectId: Uuid
  jobType: JobType
  status: JobStatus
  stateVersion: number
  progress: JobProgress
  resourceRefs?: Array<{ type: string; id: Uuid; digest?: string }>
  failure?: JobFailure
  createdAt: string
  startedAt?: string
  updatedAt: string
  finishedAt?: string
}

export interface Citation {
  documentId: string
  title: string
  sourceUrl: string
  excerpt?: string
  score?: number
}

export interface RagQueryResponse {
  schemaVersion: typeof SCHEMA_VERSION
  traceId: Uuid
  queryId: Uuid
  conversationId?: Uuid
  outcome: 'ANSWERED' | 'REFUSED'
  answer: string
  citations: Citation[]
  knowledgeVersionId: Uuid
  generatedAt: string
}

interface PublicErrorEnvelope {
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

type Fetcher = typeof fetch
type UuidFactory = () => string

function defaultFetcher(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input, init)
}

function defaultUuidFactory(): string {
  return globalThis.crypto.randomUUID()
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined
  return response.json().catch(() => undefined)
}

function normalizeCollection<T>(value: unknown, keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[]
  const record = asRecord(value)
  for (const key of ['items', ...keys]) {
    if (Array.isArray(record[key])) return record[key] as T[]
  }
  return []
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

export class ProductApi {
  constructor(
    private readonly bearerToken: string,
    private readonly fetcher: Fetcher = defaultFetcher,
    private readonly uuidFactory: UuidFactory = defaultUuidFactory,
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
    mutation = false,
  ): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    headers.set('Authorization', `Bearer ${this.bearerToken}`)
    headers.set('X-Trace-Id', this.uuidFactory())
    if (mutation) headers.set('Idempotency-Key', this.uuidFactory())
    if (init.body !== undefined) headers.set('Content-Type', 'application/json')

    const response = await this.fetcher(path, {
      ...init,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    })
    const body = await parseBody(response)
    if (!response.ok) {
      const envelope = asRecord(body) as PublicErrorEnvelope
      throw new ProductApiError({
        status: response.status,
        code: envelope.error?.code ?? envelope.code ?? `HTTP_${response.status}`,
        message: envelope.error?.message ?? envelope.message ?? `요청에 실패했습니다. (${response.status})`,
        traceId: envelope.traceId ?? response.headers.get('X-Trace-Id') ?? undefined,
        retryable: envelope.error?.retryable,
        retryAfterMs: envelope.error?.retryAfterMs,
      })
    }
    return body as T
  }

  getHealth(): Promise<HealthResponse> {
    return this.request('/api/health')
  }

  getReadiness(): Promise<ReadinessResponse> {
    return this.request('/api/readiness')
  }

  async listProjects(): Promise<Project[]> {
    return normalizeCollection<Project>(await this.request('/api/projects'), ['projects'])
  }

  getProject(projectId: Uuid): Promise<Project> {
    return this.request(`/api/projects/${projectId}`)
  }

  createProject(input: CreateProjectInput): Promise<Project> {
    return this.request('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...input }),
    }, true)
  }

  async listConnectors(projectId: Uuid): Promise<Connector[]> {
    return normalizeCollection<Connector>(
      await this.request(`/api/projects/${projectId}/connectors`),
      ['connectors'],
    )
  }

  getConnector(connectorId: Uuid): Promise<Connector> {
    return this.request(`/api/connectors/${connectorId}`)
  }

  createConnector(projectId: Uuid, input: CreateConnectorInput): Promise<Connector> {
    return this.request(`/api/projects/${projectId}/connectors`, {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...input }),
    }, true)
  }

  previewConnector(connectorId: Uuid, parameters: Record<string, string | number | boolean> = {}): Promise<ConnectorPreview> {
    return this.request(`/api/connectors/${connectorId}/preview`, {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, maxItems: 3, parameters }),
    }, true)
  }

  activateConnector(connectorId: Uuid, connectorVersionId: Uuid): Promise<Connector> {
    return this.request(`/api/connectors/${connectorId}/versions/${connectorVersionId}/activate`, {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION }),
    }, true)
  }

  syncConnector(connectorId: Uuid, connectorVersionId: Uuid): Promise<AcceptedJob> {
    return this.request(`/api/connectors/${connectorId}/sync`, {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, connectorVersionId }),
    }, true)
  }

  async listKnowledgeBases(projectId: Uuid): Promise<KnowledgeBase[]> {
    const query = new URLSearchParams({ projectId })
    return normalizeCollection<KnowledgeBase>(
      await this.request(`/api/knowledge-bases?${query}`),
      ['knowledgeBases'],
    )
  }

  getKnowledgeBase(knowledgeBaseId: Uuid): Promise<KnowledgeBase> {
    return this.request(`/api/knowledge-bases/${knowledgeBaseId}`)
  }

  createKnowledgeBase(projectId: Uuid, name: string, description?: string): Promise<KnowledgeBase> {
    return this.request('/api/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, projectId, name, description }),
    }, true)
  }

  async listKnowledgeVersions(knowledgeBaseId: Uuid): Promise<KnowledgeVersion[]> {
    return normalizeCollection<KnowledgeVersion>(
      await this.request(`/api/knowledge-bases/${knowledgeBaseId}/versions`),
      ['versions', 'knowledgeVersions'],
    )
  }

  getKnowledgeVersion(knowledgeVersionId: Uuid): Promise<KnowledgeVersion> {
    return this.request(`/api/knowledge-versions/${knowledgeVersionId}`)
  }

  startKnowledgeBuild(knowledgeBaseId: Uuid, connectorVersionId: Uuid, label: string): Promise<AcceptedJob> {
    return this.request(`/api/knowledge-bases/${knowledgeBaseId}/versions`, {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, connectorVersionId, label }),
    }, true)
  }

  activateKnowledgeVersion(knowledgeVersionId: Uuid): Promise<KnowledgeVersion> {
    return this.request(`/api/knowledge-versions/${knowledgeVersionId}/activate`, {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION }),
    }, true)
  }

  rollbackKnowledgeBase(knowledgeBaseId: Uuid, targetKnowledgeVersionId: Uuid): Promise<KnowledgeVersion> {
    return this.request(`/api/knowledge-bases/${knowledgeBaseId}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, targetKnowledgeVersionId }),
    }, true)
  }

  async listChatbots(projectId: Uuid): Promise<Chatbot[]> {
    return normalizeCollection<Chatbot>(
      await this.request(`/api/projects/${projectId}/chatbots`),
      ['chatbots'],
    )
  }

  createChatbot(projectId: Uuid, name: string, knowledgeBaseId: Uuid): Promise<Chatbot> {
    return this.request(`/api/projects/${projectId}/chatbots`, {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, name, knowledgeBaseId }),
    }, true)
  }

  queryChatbot(chatbotId: Uuid, query: string, conversationId?: Uuid): Promise<RagQueryResponse> {
    return this.request(`/api/chatbots/${chatbotId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        query,
        topK: 5,
        ...(conversationId ? { conversationId } : {}),
      }),
    }, true)
  }

  getAgentJob(jobId: Uuid): Promise<AgentJob> {
    return this.request(`/api/agent-jobs/${jobId}`)
  }

  async listAgentJobs(projectId: Uuid): Promise<AgentJob[]> {
    const query = new URLSearchParams({ projectId })
    return normalizeCollection<AgentJob>(
      await this.request(`/api/agent-jobs?${query}`),
      ['jobs', 'agentJobs'],
    )
  }

  retryAgentJob(jobId: Uuid, expectedStateVersion: number): Promise<AgentJob> {
    return this.request(`/api/agent-jobs/${jobId}/retry`, {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, expectedStateVersion }),
    }, true)
  }

  cancelAgentJob(jobId: Uuid, expectedStateVersion: number): Promise<AgentJob> {
    return this.request(`/api/agent-jobs/${jobId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ schemaVersion: SCHEMA_VERSION, expectedStateVersion }),
    }, true)
  }
}

export function describeFailure(failure: unknown): string {
  if (failure instanceof ProductApiError) {
    const trace = failure.traceId ? ` · trace ${failure.traceId.slice(0, 8)}` : ''
    return `${failure.message} [${failure.code}]${trace}`
  }
  return failure instanceof Error ? failure.message : '알 수 없는 오류가 발생했습니다.'
}
