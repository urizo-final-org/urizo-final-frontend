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

/**
 * The guardrail endpoints are wider than the job endpoints: the fence for both repositories is
 * set today, even though only backend jobs run, so a frontend job never starts unfenced later.
 */
export type GuardrailRepository = 'backend' | 'frontend'

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
  /** The Job's own trace. The decision endpoint refuses any other value. */
  traceId: string
  nodeId: string
  stage: ApprovalStage
  stageRound: number
  requiredRole: string
  expectedStateVersion: number
  pipelineAttempt: number
  candidateSha?: string
  validationHash?: string
}

/**
 * A list row deliberately does not carry the approval a Job waits on: that costs a readiness
 * computation per row on the server, and the screen opens one request before it needs it.
 * Read the detail for that.
 */
export interface JobSummary {
  jobId: string
  repository: string
  requestText: string
  status: CodingJobStatus
  currentStage?: string
  createdAt: string
  finishedAt?: string
  /** Present only when the job failed; the screen turns it into a sentence. */
  failureCode?: string
  /**
   * The analyst judged the request outside what it may change. The pipeline then ends
   * normally and the status reads COMPLETED, which to the person turned down looks like
   * success - so the screen leans on this instead of on the status.
   */
  refused?: boolean
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
  /** The actual patch, truncated server-side past 60k chars. The digest verifies the rest. */
  diff?: string
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
  refused?: boolean
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

/** One folder the administrator may let the Coding model into. */
export interface GuardrailSelection {
  path: string
  enabled: boolean
  label?: string
}

export interface GuardrailSelectionList {
  repository: string
  selections: GuardrailSelection[]
}

export interface GuardrailScanAccepted {
  scanId: string
  repository: string
}

/**
 * A scan is a runner command, so it has the runner's states: PENDING, RUNNING, SUCCEEDED,
 * FAILED. With no runner up it simply waits in PENDING, which the screen has to explain
 * rather than treat as a failure.
 */
export type GuardrailScanStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'

export interface GuardrailScanResult {
  scanId: string
  repository: string
  status: GuardrailScanStatus
  /** The origin/dev commit the folders were read from; absent until the scan finishes. */
  sha?: string
  folders: string[]
  errorCode?: string
}

/**
 * The path-independent rules. Build and test success are deliberately absent: the pipeline
 * requires them unconditionally, and a stored toggle could only contradict that.
 * A null limit means no limit — distinguishable from a number somebody chose.
 */
export interface GuardrailRules {
  allowNewDependency: boolean
  maxChangedFiles: number | null
  maxChangedLines: number | null
}

/**
 * Whether the runner — the host process a person has to start — is answering.
 * lastSeenAt is absent when the server has not heard from it since starting, which the
 * screen must treat as "off", not "unknown": a silent runner is the failure this exists for.
 */
export interface RunnerStatus {
  schemaVersion: string
  alive: boolean
  lastSeenAt?: string
}

/**
 * One thing that happened while this administrator was not looking: somebody else's
 * decision, or an approval now waiting on their own role. actorName is absent for a
 * waiting approval, which nobody has decided yet.
 */
export interface CodingNotification {
  kind: 'APPROVAL_DECIDED' | 'APPROVAL_WAITING'
  jobId: string
  requestText?: string
  stage?: string
  decision?: 'APPROVED' | 'REJECTED'
  actorName?: string
  actorRole?: string
  occurredAt?: string
}

export interface NotificationList {
  schemaVersion: string
  items: CodingNotification[]
}

export interface CodingConsoleApiClient {
  createJob(repository: CodingRepository, requestText: string): Promise<CreateJobResponse>
  listJobs(limit?: number): Promise<JobList>
  getJob(jobId: string): Promise<JobDetail>
  runnerStatus(): Promise<RunnerStatus>
  notifications(): Promise<NotificationList>
  decideApproval(
    jobId: string,
    pending: PendingApproval,
    decision: ApprovalDecision,
    feedback?: string,
  ): Promise<ApprovalDecisionResult>
  guardrailSelections(repository: GuardrailRepository): Promise<GuardrailSelectionList>
  saveGuardrailSelections(
    repository: GuardrailRepository,
    selections: GuardrailSelection[],
  ): Promise<GuardrailSelectionList>
  startGuardrailScan(repository: GuardrailRepository): Promise<GuardrailScanAccepted>
  guardrailScan(scanId: string, repository: GuardrailRepository): Promise<GuardrailScanResult>
  guardrailRules(): Promise<GuardrailRules>
  saveGuardrailRules(rules: GuardrailRules): Promise<GuardrailRules>
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

  runnerStatus = () => this.request<RunnerStatus>('/api/admin/coding/jobs/runner-status')

  notifications = () => this.request<NotificationList>('/api/admin/coding/jobs/notifications')

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
        // Echoed, never minted: the server binds the decision to the Job's own trace.
        traceId: pending.traceId,
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

  guardrailSelections = (repository: GuardrailRepository) => this.request<GuardrailSelectionList>(
    `/api/admin/coding/guardrail/selections?repository=${encodeURIComponent(repository)}`,
  )

  /**
   * Replaces the whole stored choice for one repository. A path the request omits stops being
   * allowed, so the caller sends every folder it is showing rather than only the ones it changed.
   */
  saveGuardrailSelections = (
    repository: GuardrailRepository,
    selections: GuardrailSelection[],
  ) => this.request<GuardrailSelectionList>(
    '/api/admin/coding/guardrail/selections',
    { method: 'PUT', body: JSON.stringify({ repository, selections }) },
  )

  startGuardrailScan = (repository: GuardrailRepository) => this.request<GuardrailScanAccepted>(
    '/api/admin/coding/guardrail/scans',
    { method: 'POST', body: JSON.stringify({ repository }) },
  )

  guardrailScan = (scanId: string, repository: GuardrailRepository) => this.request<GuardrailScanResult>(
    `/api/admin/coding/guardrail/scans/${encodeURIComponent(scanId)}`
      + `?repository=${encodeURIComponent(repository)}`,
  )

  guardrailRules = () => this.request<GuardrailRules>('/api/admin/coding/guardrail/rules')

  saveGuardrailRules = (rules: GuardrailRules) => this.request<GuardrailRules>(
    '/api/admin/coding/guardrail/rules',
    { method: 'PUT', body: JSON.stringify(rules) },
  )
}
