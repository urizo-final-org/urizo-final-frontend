import { ProductApiError, type PublicErrorEnvelope } from '../../../shared/api/error'
import {
  asRecord,
  defaultFetcher,
  defaultUuidFactory,
  normalizeCollection,
  parseBody,
  type Fetcher,
  type Uuid,
  type UuidFactory,
} from '../../../shared/api/http'
import {
  SCHEMA_VERSION,
  type AcceptedJob,
  type AgentJob,
  type Chatbot,
  type Connector,
  type ConnectorPreview,
  type CreateConnectorInput,
  type CreateProjectInput,
  type HealthResponse,
  type KnowledgeBase,
  type KnowledgeVersion,
  type Project,
  type RagQueryResponse,
  type ReadinessResponse,
} from './types'

export class ProductApi {
  constructor(
    private readonly bearerToken: string,
    private readonly fetcher: Fetcher = defaultFetcher,
    private readonly uuidFactory: UuidFactory = defaultUuidFactory,
    /**
     * Called when the server stops accepting this session.
     *
     * <p>Reported from the single request boundary rather than at each call site, so an operation
     * added later cannot forget to notice that the session died underneath it.
     */
    private readonly onUnauthorized: () => void = () => {},
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
      if (response.status === 401) this.onUnauthorized()
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
