import { ProductApiError, type PublicErrorEnvelope } from '../../shared/api/error'
import { fetchWithSessionRefresh, type AdminSession } from '../../shared/api/session'

/**
 * The console's side of the LLM DevOps contract.
 *
 * Reading and requesting live under /api/admin/coding/jobs, which the backend added for the
 * screen. Deciding an approval does not: it reuses the existing
 * POST /api/coding-jobs/{jobId}/approvals, because the server already knows every value that
 * endpoint demands and hands them to us in JobDetail.pendingApproval.
 */

export const CODING_SCHEMA_VERSION = '1.0'

/** The runner only implements a backend checkout today, so the server rejects anything else. */
export type CodingRepository = 'backend'

export type CodingJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'WAITING_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'

export type ApprovalStage = 'SCOPE' | 'CANDIDATE' | 'GITHUB' | 'CMS' | 'DEPLOY'
export type ApprovalDecision = 'APPROVED' | 'REJECTED'

/**
 * Everything the decision endpoint asks for, handed down by the server. approvalId is a
 * deterministic hash of the stage and round, so the screen echoes these back and never
 * derives them. candidateSha and validationHash are absent for a SCOPE approval and the
 * server rejects a request that sends only one of the pair.
 */
export interface PendingApproval {
  approvalId: string
  nodeId: string
  stage: ApprovalStage
  stageRound: number
  requiredRole: string
  expectedStateVersion: number
  pipelineAttempt: number
  candidateSha?: string
  validationHash?: string
}

export interface JobSummary {
  jobId: string
  repository: string
  requestText: string
  status: CodingJobStatus
  currentStage?: string
  pendingApproval?: PendingApproval
  createdAt: string
  finishedAt?: string
}

export interface JobList {
  schemaVersion: string
  items: JobSummary[]
}

/** Agent 1's plan and the checklist approval 1 agrees to. Either field may be absent. */
export interface Plan {
  summary?: string
  acceptanceCriteria: string[]
}

/** met is absent when the model judged the criterion but did not say either way. */
export interface CriterionResult {
  criterion: string
  met?: boolean
}

export interface Report {
  summary?: string
  criteriaResults: CriterionResult[]
}

export interface DecisionRecord {
  stage: ApprovalStage
  decision: ApprovalDecision
  actorRole: string
  feedback?: string
  decidedAt: string
}

export interface PreviewLink {
  ready: boolean
  url?: string
}

/** stale true means dev moved underneath the Job after it started. */
export interface BaseShaFreshness {
  stale: boolean
  currentDevSha?: string
}

/**
 * Super administrator only. The server omits this whole object for a general administrator,
 * so its absence is the authority on what may be shown - not a check in the browser.
 */
export interface Technical {
  baseSha?: string
  candidateSha?: string
  diffDigest?: string
  changedPaths: string[]
  checkProfile?: string
  pullRequestUrl?: string
  baseShaFreshness?: BaseShaFreshness
}

export interface JobDetail {
  schemaVersion: string
  jobId: string
  repository: string
  requestText: string
  status: CodingJobStatus
  currentStage?: string
  pipelineAttempt: number
  maxPipelineAttempts: number
  plan?: Plan
  report?: Report
  pendingApproval?: PendingApproval
  decisions: DecisionRecord[]
  preview?: PreviewLink
  technical?: Technical
  createdAt: string
  finishedAt?: string
}

/** The server returns the whole worker-facing Job as well; the console reads only these. */
export interface CreateJobResponse {
  schemaVersion: string
  job: {
    jobId: string
    status: CodingJobStatus
    stateVersion: number
  }
  request: {
    jobId: string
    requestText: string
    createdAt: string
  }
}

/** As above: the decision response carries more, and the console reads only these. */
export interface ApprovalDecisionResult {
  schemaVersion: string
  jobId: string
  approvalId: string
  stage: ApprovalStage
  decision: ApprovalDecision
  stateVersion: number
  status: CodingJobStatus
}

export interface CodingConsoleApiClient {
  createJob(repository: CodingRepository, requestText: string): Promise<CreateJobResponse>
  listJobs(limit?: number): Promise<JobList>
  getJob(jobId: string): Promise<JobDetail>
  decideApproval(
    jobId: string,
    pending: PendingApproval,
    decision: ApprovalDecision,
    feedback?: string,
  ): Promise<ApprovalDecisionResult>
}

async function responseBody<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as PublicErrorEnvelope
    throw new ProductApiError({
      status: response.status,
      code: body.error?.code ?? body.code ?? `HTTP_${response.status}`,
      message: body.error?.message ?? body.message ?? '코딩 요청을 처리하지 못했습니다.',
      traceId: body.traceId,
      retryable: body.error?.retryable,
      retryAfterMs: body.error?.retryAfterMs,
    })
  }
  return response.json() as Promise<T>
}

export class CodingConsoleApi implements CodingConsoleApiClient {
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

  createJob = (repository: CodingRepository, requestText: string) => this.request<CreateJobResponse>(
    '/api/admin/coding/jobs',
    { method: 'POST', body: JSON.stringify({ repository, requestText }) },
  )

  listJobs = (limit = 20) => this.request<JobList>(
    `/api/admin/coding/jobs?limit=${encodeURIComponent(String(limit))}`,
  )

  getJob = (jobId: string) => this.request<JobDetail>(
    `/api/admin/coding/jobs/${encodeURIComponent(jobId)}`,
  )

  decideApproval = (
    jobId: string,
    pending: PendingApproval,
    decision: ApprovalDecision,
    feedback?: string,
  ) => this.request<ApprovalDecisionResult>(
    `/api/coding-jobs/${encodeURIComponent(jobId)}/approvals`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        schemaVersion: CODING_SCHEMA_VERSION,
        traceId: crypto.randomUUID(),
        expectedStateVersion: pending.expectedStateVersion,
        pipelineAttempt: pending.pipelineAttempt,
        approvalId: pending.approvalId,
        nodeId: pending.nodeId,
        stage: pending.stage,
        stageRound: pending.stageRound,
        candidateSha: pending.candidateSha,
        validationHash: pending.validationHash,
        decision,
        feedback,
      }),
    },
  )
}
