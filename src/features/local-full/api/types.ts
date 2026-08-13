import type { Uuid } from '../../../shared/api/http'

export const SCHEMA_VERSION = '1.0' as const

export type { Uuid }

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
