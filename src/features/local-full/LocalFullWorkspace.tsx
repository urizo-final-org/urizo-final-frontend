import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { describeFailure } from '../../shared/api/error'
import { ROLE_LABELS, type AdminSession } from '../../shared/api/session'
import {
  ProductApi,
  type AgentJob,
  type Chatbot,
  type Connector,
  type ConnectorPreview,
  type CreateConnectorInput,
  type HealthResponse,
  type KnowledgeBase,
  type KnowledgeVersion,
  type Project,
  type RagQueryResponse,
  type ReadinessResponse,
} from './api'

const ACTIVE_PROJECT_KEY = 'axms.local-full.active-project'

const localFixtureConnector: CreateConnectorInput = {
  name: 'LOCAL_FIXTURE_TOURISM',
  baseUrl: 'https://fixture.invalid/api',
  endpoint: '/tourism/v1/items',
  method: 'GET',
  authentication: {
    type: 'API_KEY',
    location: 'QUERY',
    name: 'serviceKey',
    secretRef: 'fixture://public-data/local-tourism',
  },
  requestParameters: [
    {
      name: 'region',
      type: 'STRING',
      required: false,
      description: 'Deterministic local fixture region',
      defaultValue: 'SEOUL',
    },
  ],
  response: {
    itemsPath: '$.data',
    totalCountPath: '$.totalCount',
  },
  pagination: {
    type: 'PAGE',
    pageParameter: 'page',
    pageSizeParameter: 'perPage',
    startPage: 1,
    pageSize: 20,
  },
  documentMapping: {
    documentId: '$.contentId',
    title: '$.title',
    content: '$.description',
    category: '$.category',
    sourceUpdatedAt: '$.updatedAt',
    sourceUrl: '$.sourceUrl',
  },
}

type Notice = { tone: 'success' | 'warning' | 'danger'; text: string }

const FIELD_LABEL = 'text-[10px] font-bold text-[#667085]'
const FIELD_INPUT = 'w-full min-w-0 rounded-lg border border-[#d6dce5] bg-white px-[11px] py-[10px] text-[#252b38]'
const BUTTON_PRIMARY = 'min-h-[38px] rounded-lg border border-transparent bg-purple px-[13px] text-[10px] font-extrabold whitespace-nowrap text-white shadow-[0_4px_12px_rgba(105,87,232,0.18)] enabled:hover:bg-purple-dark'
const BUTTON_SECONDARY = 'min-h-[38px] rounded-lg border border-[#d8dee7] bg-[#f7f8fa] px-[13px] text-[10px] font-extrabold whitespace-nowrap text-[#4c5669] enabled:hover:bg-[#eef1f5]'
const BUTTON_DANGER = 'min-h-[38px] rounded-lg border border-[#ecc2c8] bg-[#fff3f4] px-[13px] text-[10px] font-extrabold whitespace-nowrap text-[#ba3546] enabled:hover:bg-[#ffe8eb]'

function formatTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function shortId(value?: string | null): string {
  return value ? value.slice(0, 8) : '—'
}

function statusTone(status?: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (!status) return 'neutral'
  if (['UP', 'READY', 'ACTIVE', 'SUCCEEDED', 'ANSWERED'].includes(status)) return 'success'
  if (['FAILED', 'CANCELLED', 'DOWN', 'NOT_READY', 'REFUSED'].includes(status)) return 'danger'
  if (['RUNNING', 'QUEUED', 'WAITING_APPROVAL', 'APPROVAL_PENDING', 'DRAFT', 'BUILD_REQUESTED', 'BUILDING'].includes(status)) return 'warning'
  return 'neutral'
}

const STATUS_BADGE_BASE =
  'inline-flex w-fit items-center rounded-full border px-2 py-[5px] font-mono text-[9px] font-extrabold leading-none tracking-[0.04em]'

const STATUS_BADGE_TONE_CLASSES: Record<'success' | 'warning' | 'danger' | 'neutral', string> = {
  success: 'border-[#bfeadb] bg-[#e8f8f2] text-[#087b5b]',
  warning: 'border-[#f0dba7] bg-[#fff7e4] text-[#8a5a03]',
  danger: 'border-[#efc4cb] bg-[#fff0f2] text-[#b33243]',
  neutral: 'border-[#dce1e8] bg-[#f4f6f9] text-[#667085]',
}

function StatusBadge({ status, className }: { status?: string; className?: string }) {
  return (
    <span className={`${STATUS_BADGE_BASE} ${STATUS_BADGE_TONE_CLASSES[statusTone(status)]} ${className ?? ''}`}>
      {status ?? 'NOT READY'}
    </span>
  )
}

function SectionCard({
  step,
  title,
  description,
  state,
  children,
}: {
  step: string
  title: string
  description: string
  state?: string
  children: React.ReactNode
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-panel shadow-[0_7px_28px_rgba(31,43,65,0.045)]">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-b border-[#edf0f4] px-[19px] py-[18px] max-[560px]:grid-cols-[auto_1fr]">
        <span className="grid h-[31px] w-[31px] place-items-center rounded-lg bg-[#f0edff] font-mono text-[10px] font-extrabold leading-none text-purple">
          {step}
        </span>
        <div>
          <h2 className="mb-[5px] mt-0 text-[15px] tracking-[-0.015em]">{title}</h2>
          <p className="m-0 text-[11px] leading-[1.55] text-[#7a8496]">{description}</p>
        </div>
        {state && <StatusBadge status={state} className="max-[560px]:col-start-2" />}
      </header>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-[14px] px-[19px] pb-5 pt-[18px]">{children}</div>
    </section>
  )
}

function upsertById<T>(items: T[], next: T, id: (item: T) => string): T[] {
  const index = items.findIndex((item) => id(item) === id(next))
  if (index < 0) return [next, ...items]
  return items.map((item, itemIndex) => itemIndex === index ? next : item)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function jobReferences(job: AgentJob, type: string, id?: string | null): boolean {
  return Boolean(id && job.resourceRefs?.some((reference) => reference.type === type && reference.id === id))
}

interface LocalFullWorkspaceProps {
  /** The signed-in session. The shell owns it, so this workspace never signs anyone in itself. */
  session: AdminSession
  /** Raised when the server stops accepting the session, so the shell can return to sign-in. */
  onSessionExpired: () => void
}

export default function LocalFullWorkspace({ session, onSessionExpired }: LocalFullWorkspaceProps) {
  const [api, setApi] = useState<ProductApi | null>(null)
  const [bootNonce, setBootNonce] = useState(0)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [readinessError, setReadinessError] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null)
  const actorId = session.actor.actorId

  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [preview, setPreview] = useState<ConnectorPreview | null>(null)
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(null)
  const [knowledgeVersions, setKnowledgeVersions] = useState<KnowledgeVersion[]>([])
  const [chatbots, setChatbots] = useState<Chatbot[]>([])
  const [jobs, setJobs] = useState<AgentJob[]>([])

  const [projectName, setProjectName] = useState('Local Full Demo')
  const [projectDescription, setProjectDescription] = useState('Deterministic local fixture end-to-end workspace')
  const [knowledgeName, setKnowledgeName] = useState('Local Tourism Knowledge')
  const [query, setQuery] = useState('서울에서 열리는 야간 축제를 알려줘.')
  const [ragResult, setRagResult] = useState<RagQueryResponse | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const mounted = useRef(true)
  const polling = useRef(new Set<string>())

  const connector = useMemo(
    () => connectors.find((item) => item.name === localFixtureConnector.name && item.status === 'ACTIVE')
      ?? connectors.find((item) => item.name === localFixtureConnector.name)
      ?? null,
    [connectors],
  )
  const activeConnectorVersionId = connector?.activeVersionId ?? (connector?.status === 'ACTIVE' ? connector.connectorVersionId : null)
  const candidateKnowledgeVersion = useMemo(
    () => knowledgeVersions.find((item) => item.status === 'APPROVAL_PENDING') ?? null,
    [knowledgeVersions],
  )
  const latestPendingKnowledgeVersion = useMemo(
    () => knowledgeVersions.find((item) => item.status !== 'ACTIVE' && item.status !== 'ARCHIVED') ?? null,
    [knowledgeVersions],
  )
  const rollbackVersions = useMemo(
    () => knowledgeVersions.filter((item) => item.status === 'ARCHIVED'),
    [knowledgeVersions],
  )
  const chatbot = useMemo(
    () => chatbots.find((item) => item.knowledgeBaseId === knowledgeBase?.knowledgeBaseId && item.status === 'ACTIVE')
      ?? chatbots.find((item) => item.knowledgeBaseId === knowledgeBase?.knowledgeBaseId)
      ?? null,
    [chatbots, knowledgeBase?.knowledgeBaseId],
  )
  const connectorSyncRunning = jobs.some((job) => job.jobType === 'CONNECTOR_SYNC'
    && ['QUEUED', 'RUNNING'].includes(job.status)
    && jobReferences(job, 'CONNECTOR_VERSION', activeConnectorVersionId))
  const connectorSyncSucceeded = jobs.some((job) => job.jobType === 'CONNECTOR_SYNC'
    && job.status === 'SUCCEEDED'
    && jobReferences(job, 'CONNECTOR_VERSION', activeConnectorVersionId))
  const knowledgeJobOutstanding = jobs.some((job) => job.jobType === 'KNOWLEDGE_BUILD'
    && ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(job.status)
    && jobReferences(job, 'KNOWLEDGE_BASE', knowledgeBase?.knowledgeBaseId))

  async function refreshProjectData(client: ProductApi, projectId: string) {
    const [nextConnectors, nextKnowledgeBases, nextChatbots, nextJobs] = await Promise.all([
      client.listConnectors(projectId),
      client.listKnowledgeBases(projectId),
      client.listChatbots(projectId),
      client.listAgentJobs(projectId),
    ])
    if (!mounted.current) return
    setConnectors(nextConnectors)
    setKnowledgeBases(nextKnowledgeBases)
    setChatbots(nextChatbots)
    setJobs(nextJobs)

    const preferredKnowledgeBase = nextKnowledgeBases.find((item) => item.knowledgeBaseId === knowledgeBase?.knowledgeBaseId)
      ?? nextKnowledgeBases[0]
      ?? null
    setKnowledgeBase(preferredKnowledgeBase)
    if (preferredKnowledgeBase) {
      const versions = await client.listKnowledgeVersions(preferredKnowledgeBase.knowledgeBaseId)
      if (mounted.current) {
        setKnowledgeVersions(versions)
        setRollbackTarget((current) => versions.some((item) => item.status === 'ARCHIVED' && item.knowledgeVersionId === current)
          ? current
          : versions.find((item) => item.status === 'ARCHIVED')?.knowledgeVersionId ?? '')
      }
    } else {
      setKnowledgeVersions([])
      setRollbackTarget('')
    }

    for (const job of nextJobs) {
      if (job.status === 'QUEUED' || job.status === 'RUNNING') {
        void pollJob(client, projectId, job.jobId)
      }
    }
  }

  async function pollJob(client: ProductApi, projectId: string, jobId: string) {
    if (polling.current.has(jobId)) return
    polling.current.add(jobId)
    try {
      for (let attempt = 0; attempt < 120 && mounted.current; attempt += 1) {
        await delay(attempt === 0 ? 400 : 1500)
        const next = await client.getAgentJob(jobId)
        if (!mounted.current) return
        setJobs((current) => upsertById(current, next, (item) => item.jobId))
        if (!['QUEUED', 'RUNNING'].includes(next.status)) {
          await refreshProjectData(client, projectId)
          return
        }
      }
    } catch (failure) {
      if (mounted.current) setNotice({ tone: 'warning', text: `Job polling 중단: ${describeFailure(failure)}` })
    } finally {
      polling.current.delete(jobId)
    }
  }

  useEffect(() => {
    mounted.current = true
    let cancelled = false

    async function bootstrap() {
      setBooting(true)
      setBootError(null)
      setReadinessError(null)
      try {
        const client = new ProductApi(
          session.sessionToken, undefined, undefined, onSessionExpired)
        setApi(client)

        const [healthResult, readinessResult, projectResult] = await Promise.allSettled([
          client.getHealth(),
          client.getReadiness(),
          client.listProjects(),
        ])
        if (cancelled) return
        if (healthResult.status === 'fulfilled') setHealth(healthResult.value)
        if (readinessResult.status === 'fulfilled') {
          setReadiness(readinessResult.value)
        } else {
          setReadinessError(describeFailure(readinessResult.reason))
        }
        if (projectResult.status === 'rejected') throw projectResult.reason

        setProjects(projectResult.value)
        const preferredId = window.localStorage.getItem(ACTIVE_PROJECT_KEY)
        const selected = projectResult.value.find((item) => item.projectId === preferredId)
          ?? projectResult.value[0]
          ?? null
        if (selected) {
          const restored = await client.getProject(selected.projectId)
          if (cancelled) return
          setProject(restored)
          window.localStorage.setItem(ACTIVE_PROJECT_KEY, restored.projectId)
          await refreshProjectData(client, restored.projectId)
        }
      } catch (failure) {
        if (!cancelled) setBootError(describeFailure(failure))
      } finally {
        if (!cancelled) setBooting(false)
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
      mounted.current = false
    }
    // A nonce deliberately owns full session re-bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootNonce])

  async function runAction(action: string, operation: () => Promise<void>, success: string) {
    setBusy(action)
    setNotice(null)
    try {
      await operation()
      setNotice({ tone: 'success', text: success })
    } catch (failure) {
      setNotice({ tone: 'danger', text: describeFailure(failure) })
    } finally {
      setBusy(null)
    }
  }

  async function selectProject(projectId: string) {
    if (!api) return
    await runAction('select-project', async () => {
      const next = await api.getProject(projectId)
      setProject(next)
      setPreview(null)
      setRagResult(null)
      window.localStorage.setItem(ACTIVE_PROJECT_KEY, next.projectId)
      await refreshProjectData(api, next.projectId)
    }, 'Project context를 복원했습니다.')
  }

  function createProject(event: FormEvent) {
    event.preventDefault()
    if (!api) return
    void runAction('create-project', async () => {
      const next = await api.createProject({ name: projectName.trim(), description: projectDescription.trim() || undefined })
      setProjects((current) => upsertById(current, next, (item) => item.projectId))
      setProject(next)
      window.localStorage.setItem(ACTIVE_PROJECT_KEY, next.projectId)
      await refreshProjectData(api, next.projectId)
    }, 'Project가 생성되고 현재 context로 선택됐습니다.')
  }

  function createConnector() {
    if (!api || !project) return
    void runAction('create-connector', async () => {
      const next = await api.createConnector(project.projectId, localFixtureConnector)
      setConnectors((current) => upsertById(current, next, (item) => item.connectorId))
      setPreview(null)
    }, 'Deterministic local fixture Connector draft를 저장했습니다.')
  }

  function previewConnector() {
    if (!api || !connector) return
    void runAction('preview-connector', async () => {
      setPreview(await api.previewConnector(connector.connectorId, { region: 'SEOUL' }))
    }, '실제 Spring API가 local fixture adapter를 통해 미리보기를 반환했습니다.')
  }

  function activateConnector() {
    if (!api || !project || !connector) return
    void runAction('activate-connector', async () => {
      await api.activateConnector(connector.connectorId, connector.connectorVersionId)
      await refreshProjectData(api, project.projectId)
    }, '검증된 Connector version을 활성화했습니다.')
  }

  function syncConnector() {
    if (!api || !project || !connector || !activeConnectorVersionId) return
    void runAction('sync-connector', async () => {
      const accepted = await api.syncConnector(connector.connectorId, activeConnectorVersionId)
      const next = await api.getAgentJob(accepted.jobId)
      setJobs((current) => upsertById(current, next, (item) => item.jobId))
      void pollJob(api, project.projectId, accepted.jobId)
    }, 'Connector sync Job이 Queue에 등록됐습니다.')
  }

  function createKnowledgeBase(event: FormEvent) {
    event.preventDefault()
    if (!api || !project) return
    void runAction('create-knowledge', async () => {
      const next = await api.createKnowledgeBase(project.projectId, knowledgeName.trim(), 'Local fixture RAG knowledge base')
      setKnowledgeBases((current) => upsertById(current, next, (item) => item.knowledgeBaseId))
      setKnowledgeBase(next)
      setKnowledgeVersions([])
    }, 'Knowledge Base를 생성했습니다. Active version은 아직 없습니다.')
  }

  function selectKnowledgeBase(knowledgeBaseId: string) {
    if (!api) return
    void runAction('select-knowledge', async () => {
      const next = await api.getKnowledgeBase(knowledgeBaseId)
      const versions = await api.listKnowledgeVersions(knowledgeBaseId)
      setKnowledgeBase(next)
      setKnowledgeVersions(versions)
      setRollbackTarget(versions.find((item) => item.status === 'ARCHIVED')?.knowledgeVersionId ?? '')
    }, 'Knowledge Base와 version history를 불러왔습니다.')
  }

  function startKnowledgeBuild() {
    if (!api || !project || !knowledgeBase || !activeConnectorVersionId
      || !connectorSyncSucceeded || knowledgeJobOutstanding) return
    void runAction('start-build', async () => {
      const label = `local-full-${new Date().toISOString().slice(0, 19)}`
      const accepted = await api.startKnowledgeBuild(knowledgeBase.knowledgeBaseId, activeConnectorVersionId, label)
      const next = await api.getAgentJob(accepted.jobId)
      setJobs((current) => upsertById(current, next, (item) => item.jobId))
      if (accepted.knowledgeVersionId) {
        const version = await api.getKnowledgeVersion(accepted.knowledgeVersionId)
        setKnowledgeVersions((current) => upsertById(current, version, (item) => item.knowledgeVersionId))
      }
      void pollJob(api, project.projectId, accepted.jobId)
    }, 'Knowledge Build가 시작됐습니다. 기존 Active version은 유지됩니다.')
  }

  function activateKnowledgeVersion() {
    if (!api || !project || !candidateKnowledgeVersion) return
    void runAction('activate-knowledge', async () => {
      await api.activateKnowledgeVersion(candidateKnowledgeVersion.knowledgeVersionId)
      await refreshProjectData(api, project.projectId)
    }, '승인 대기 Knowledge version을 Active로 전환했습니다.')
  }

  function rollbackKnowledge() {
    if (!api || !project || !knowledgeBase || !rollbackTarget) return
    void runAction('rollback-knowledge', async () => {
      await api.rollbackKnowledgeBase(knowledgeBase.knowledgeBaseId, rollbackTarget)
      await refreshProjectData(api, project.projectId)
    }, '선택한 이전 Knowledge version으로 원자적 복구했습니다.')
  }

  function createChatbot() {
    if (!api || !project || !knowledgeBase?.activeVersionId) return
    void runAction('create-chatbot', async () => {
      const next = await api.createChatbot(project.projectId, 'Local Tourism Guide', knowledgeBase.knowledgeBaseId)
      setChatbots((current) => upsertById(current, next, (item) => item.chatbotId))
    }, 'Active Knowledge에 연결된 Chatbot을 생성했습니다.')
  }

  function askChatbot(event: FormEvent) {
    event.preventDefault()
    if (!api || !chatbot) return
    void runAction('query-rag', async () => {
      setRagResult(await api.queryChatbot(chatbot.chatbotId, query.trim()))
    }, '서버가 선택한 Active Knowledge version으로 답변했습니다.')
  }

  function retryJob(job: AgentJob) {
    if (!api || !project) return
    void runAction(`retry-${job.jobId}`, async () => {
      const next = await api.retryAgentJob(job.jobId, job.stateVersion)
      setJobs((current) => upsertById(current, next, (item) => item.jobId))
      void pollJob(api, project.projectId, next.jobId)
    }, '동일 업무 Job을 새 시도로 재개했습니다.')
  }

  function cancelJob(job: AgentJob) {
    if (!api) return
    void runAction(`cancel-${job.jobId}`, async () => {
      const next = await api.cancelAgentJob(job.jobId, job.stateVersion)
      setJobs((current) => upsertById(current, next, (item) => item.jobId))
    }, 'Job 취소 요청이 authoritative 상태에 반영됐습니다.')
  }

  if (booting) {
    return (
      <section
        className="grid min-h-[260px] place-items-center gap-3 rounded-2xl border border-dashed border-[#cfd6e1] bg-white p-9 text-center text-xs text-[#707b8d]"
        aria-live="polite"
      >
        <span className="h-[25px] w-[25px] animate-[spin_700ms_linear_infinite] rounded-full border-[3px] border-[#e3e0fa] border-t-purple" />
        Local full session과 Project context를 복원하는 중입니다…
      </section>
    )
  }

  if (bootError) {
    return (
      <section
        className="grid min-h-[260px] place-items-center gap-3 rounded-2xl border border-dashed border-[#e6b8c0] bg-[#fff7f8] p-9 text-center text-xs text-[#a93242]"
        role="alert"
      >
        <strong>Local full workspace를 시작하지 못했습니다.</strong>
        <span>{bootError}</span>
        <button
          className="min-h-[38px] rounded-lg border border-transparent bg-purple px-[13px] text-[10px] font-extrabold whitespace-nowrap text-white shadow-[0_4px_12px_rgba(105,87,232,0.18)] enabled:hover:bg-purple-dark"
          onClick={() => setBootNonce((value) => value + 1)}
        >
          다시 연결
        </button>
      </section>
    )
  }

  const noticeClasses: Record<Notice['tone'], string> = {
    success: 'text-[#087b5b] bg-[#eaf9f3] border-[#bce8d8]',
    warning: 'text-[#795006] bg-[#fff8e8] border-[#eed9a7]',
    danger: 'text-[#aa3040] bg-[#fff0f2] border-[#efc1c8]',
  }

  return (
    <div>
      <section className="mb-6 flex items-start justify-between gap-7 max-[820px]:grid">
        <div>
          <p className="m-0 font-mono text-[10px] font-extrabold uppercase leading-[1.4] tracking-[0.13em] text-purple">Local full · Deterministic P0</p>
          <h1 className="my-1 mb-[9px] text-[clamp(29px,4vw,43px)] leading-[1.07] tracking-[-0.045em] text-[#151b27]">Project에서 RAG 답변까지</h1>
          <p className="m-0 max-w-[760px] text-[13px] leading-[1.7] text-muted">브라우저 runtime mock 없이 Nginx와 Spring public API 경계를 그대로 사용하는 작업 화면입니다.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 max-[820px]:justify-start" aria-label="서비스 상태">
          <div className="grid min-w-[94px] gap-[5px] rounded-[10px] border border-line bg-panel px-3 py-[10px]">
            <span className="text-[9px] uppercase tracking-[0.08em] text-[#8a94a5]">API</span>
            <StatusBadge status={health?.status} />
          </div>
          <div className="grid min-w-[94px] gap-[5px] rounded-[10px] border border-line bg-panel px-3 py-[10px]">
            <span className="text-[9px] uppercase tracking-[0.08em] text-[#8a94a5]">Readiness</span>
            <StatusBadge status={readiness?.status} />
          </div>
          <div className="grid min-w-[94px] gap-[5px] rounded-[10px] border border-line bg-panel px-3 py-[10px]">
            <span className="text-[9px] uppercase tracking-[0.08em] text-[#8a94a5]">Session</span>
            <StatusBadge status={api ? 'READY' : undefined} />
          </div>
        </div>
      </section>

      {readinessError && (
        <div className={`mb-[14px] rounded-[9px] border px-[14px] py-3 text-xs leading-[1.55] ${noticeClasses.warning}`} role="status">
          Readiness 확인 실패: {readinessError}. Product API 동작과 별도로 다시 점검하세요.
        </div>
      )}
      {notice && (
        <div className={`mb-[14px] rounded-[9px] border px-[14px] py-3 text-xs leading-[1.55] ${noticeClasses[notice.tone]}`} role="status">
          {notice.text}
        </div>
      )}

      <section className="mb-4 grid grid-cols-4 overflow-hidden rounded-xl border border-[#222d3e] bg-[#171f2d] max-[820px]:grid-cols-2 max-[560px]:grid-cols-1">
        <div className="grid min-w-0 gap-[5px] border-r border-white/[0.08] px-[17px] py-[14px] max-[820px]:border-b max-[560px]:border-r-0">
          <span className="font-mono text-[9px] uppercase leading-none tracking-[0.08em] text-[#76849a]">Actor</span>
          <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[#e8edf5]">{ROLE_LABELS[session.actor.role]} · {shortId(actorId)}</strong>
        </div>
        <div className="grid min-w-0 gap-[5px] border-r border-white/[0.08] px-[17px] py-[14px] max-[820px]:border-r-0 max-[820px]:border-b max-[560px]:border-b">
          <span className="font-mono text-[9px] uppercase leading-none tracking-[0.08em] text-[#76849a]">Project</span>
          <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[#e8edf5]">{project?.name ?? '아직 없음'}</strong>
        </div>
        <div className="grid min-w-0 gap-[5px] border-r border-white/[0.08] px-[17px] py-[14px] max-[560px]:border-r-0 max-[560px]:border-b">
          <span className="font-mono text-[9px] uppercase leading-none tracking-[0.08em] text-[#76849a]">Connector</span>
          <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[#e8edf5]">{connector?.name ?? '아직 없음'}</strong>
        </div>
        <div className="grid min-w-0 gap-[5px] px-[17px] py-[14px]">
          <span className="font-mono text-[9px] uppercase leading-none tracking-[0.08em] text-[#76849a]">Active Knowledge</span>
          <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[#e8edf5]">{shortId(knowledgeBase?.activeVersionId)}</strong>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-[15px] max-[1120px]:grid-cols-1">
        <SectionCard step="01" title="Project context" description="생성 후 list/get 계약으로 새로고침 상태를 복원합니다." state={project?.status}>
          {projects.length > 0 && (
            <label className="grid min-w-0 gap-[7px]">
              <span className={FIELD_LABEL}>저장된 Project</span>
              <select className={FIELD_INPUT} value={project?.projectId ?? ''} onChange={(event) => void selectProject(event.target.value)} disabled={busy !== null}>
                {projects.map((item) => <option key={item.projectId} value={item.projectId}>{item.name}</option>)}
              </select>
            </label>
          )}
          <form className="grid min-w-0 max-w-full grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)_auto] items-end gap-[9px] max-[820px]:grid-cols-1 [&>*]:min-w-0 [&>*]:max-w-full" onSubmit={createProject}>
            <label className="grid min-w-0 gap-[7px]">
              <span className={FIELD_LABEL}>새 Project 이름</span>
              <input className={FIELD_INPUT} value={projectName} onChange={(event) => setProjectName(event.target.value)} minLength={1} maxLength={120} required />
            </label>
            <label className="grid min-w-0 gap-[7px]">
              <span className={FIELD_LABEL}>설명</span>
              <input className={FIELD_INPUT} value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} maxLength={2000} />
            </label>
            <button className={BUTTON_PRIMARY} disabled={!api || busy !== null || !projectName.trim()}>{busy === 'create-project' ? '생성 중…' : 'Project 생성'}</button>
          </form>
        </SectionCard>

        <SectionCard step="02" title="Fixture Connector" description="실제 공공 API 대신 Backend deterministic adapter만 호출합니다." state={connector?.status}>
          <dl className="grid gap-[7px] rounded-lg border border-[#e7eaf0] bg-[#f7f8fb] px-3 py-[11px]">
            <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-2">
              <dt className="font-mono text-[9px] uppercase leading-[1.5] text-[#8993a4]">Base URL</dt>
              <dd className="m-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] leading-[1.5] text-[#3c4658]">{localFixtureConnector.baseUrl}</dd>
            </div>
            <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-2">
              <dt className="font-mono text-[9px] uppercase leading-[1.5] text-[#8993a4]">Items path</dt>
              <dd className="m-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] leading-[1.5] text-[#3c4658]">{localFixtureConnector.response.itemsPath}</dd>
            </div>
            <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-2">
              <dt className="font-mono text-[9px] uppercase leading-[1.5] text-[#8993a4]">Version</dt>
              <dd className="m-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] leading-[1.5] text-[#3c4658]">{shortId(connector?.connectorVersionId)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {!connector && <button className={BUTTON_PRIMARY} onClick={createConnector} disabled={!project || busy !== null}>{busy === 'create-connector' ? '저장 중…' : 'Fixture Connector 생성'}</button>}
            {connector && <button className={BUTTON_SECONDARY} onClick={previewConnector} disabled={busy !== null}>{busy === 'preview-connector' ? '확인 중…' : '응답 미리보기'}</button>}
            {connector?.status === 'DRAFT' && <button className={BUTTON_PRIMARY} onClick={activateConnector} disabled={!preview || busy !== null}>{busy === 'activate-connector' ? '활성화 중…' : '검증 후 활성화'}</button>}
            {activeConnectorVersionId && <button className={BUTTON_PRIMARY} onClick={syncConnector} disabled={busy !== null || connectorSyncRunning}>{busy === 'sync-connector' ? '등록 중…' : connectorSyncRunning ? 'Sync 실행 중…' : 'Connector Sync'}</button>}
          </div>
          {activeConnectorVersionId && !connectorSyncSucceeded && <p className="m-0 p-7 text-center text-[11px] text-[#8a94a5]">Sync Job이 성공하면 Knowledge Build 단계가 열립니다.</p>}
          {preview && (
            <div className="grid gap-2 rounded-[9px] border border-[#dceae5] bg-[#f6f9f8] p-3">
              <header className="flex justify-between text-[10px] text-[#567064]">
                <strong>{preview.itemCount}개 정규화 문서</strong>
                <span>{preview.truncated ? '일부만 표시' : '전체 fixture sample'}</span>
              </header>
              {preview.documents.map((document) => (
                <article key={document.documentId} className="rounded-[7px] border border-[#e1e9e6] bg-white p-[10px]">
                  <span className="font-mono text-[9px] leading-none text-[#719084]">{document.documentId}</span>
                  <h3 className="mb-1 mt-[5px] text-xs">{document.title}</h3>
                  <p className="m-0 line-clamp-2 text-[10px] leading-[1.5] text-[#637067]">{document.content}</p>
                </article>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard step="03" title="Knowledge build" description="Build는 새 version을 만들며 기존 Active pointer를 자동 변경하지 않습니다." state={knowledgeBase?.activeVersionId ? 'ACTIVE' : latestPendingKnowledgeVersion?.status}>
          {knowledgeBases.length > 0 && (
            <label className="grid min-w-0 gap-[7px]">
              <span className={FIELD_LABEL}>Knowledge Base</span>
              <select className={FIELD_INPUT} value={knowledgeBase?.knowledgeBaseId ?? ''} onChange={(event) => selectKnowledgeBase(event.target.value)} disabled={busy !== null}>
                {knowledgeBases.map((item) => <option key={item.knowledgeBaseId} value={item.knowledgeBaseId}>{item.name}</option>)}
              </select>
            </label>
          )}
          {!knowledgeBase && (
            <form className="grid min-w-0 max-w-full grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)_auto] items-end gap-[9px] max-[820px]:grid-cols-1 [&>*]:min-w-0 [&>*]:max-w-full" onSubmit={createKnowledgeBase}>
              <label className="col-span-2 grid min-w-0 gap-[7px] max-[820px]:col-span-1">
                <span className={FIELD_LABEL}>Knowledge 이름</span>
                <input className={FIELD_INPUT} value={knowledgeName} onChange={(event) => setKnowledgeName(event.target.value)} maxLength={120} required />
              </label>
              <button className={BUTTON_PRIMARY} disabled={!project || busy !== null || !knowledgeName.trim()}>{busy === 'create-knowledge' ? '생성 중…' : 'Knowledge Base 생성'}</button>
            </form>
          )}
          {knowledgeBase && (
            <>
              <div className="grid grid-cols-3 rounded-lg border border-[#e6e9ef] bg-[#f8f9fb] max-[560px]:grid-cols-1">
                <div className="grid gap-1 border-r border-[#e6e9ef] px-[11px] py-[10px] max-[560px]:border-b max-[560px]:border-r-0">
                  <span className="text-[9px] text-[#8a93a3]">Active</span>
                  <strong className="font-mono text-[11px] leading-[1.3]">{shortId(knowledgeBase.activeVersionId)}</strong>
                </div>
                <div className="grid gap-1 border-r border-[#e6e9ef] px-[11px] py-[10px] max-[560px]:border-b max-[560px]:border-r-0">
                  <span className="text-[9px] text-[#8a93a3]">Versions</span>
                  <strong className="font-mono text-[11px] leading-[1.3]">{knowledgeVersions.length}</strong>
                </div>
                <div className="grid gap-1 px-[11px] py-[10px]">
                  <span className="text-[9px] text-[#8a93a3]">Candidate</span>
                  <strong className="font-mono text-[11px] leading-[1.3]">{latestPendingKnowledgeVersion?.status ?? '—'}</strong>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={BUTTON_PRIMARY} onClick={startKnowledgeBuild} disabled={!activeConnectorVersionId || !connectorSyncSucceeded || knowledgeJobOutstanding || busy !== null}>{busy === 'start-build' ? '시작 중…' : knowledgeJobOutstanding ? 'Build 진행 중…' : 'Knowledge Build'}</button>
                <button className={BUTTON_PRIMARY} onClick={activateKnowledgeVersion} disabled={!candidateKnowledgeVersion || busy !== null}>{busy === 'activate-knowledge' ? '전환 중…' : 'Candidate 활성화'}</button>
              </div>
              {rollbackVersions.length > 0 && (
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-t border-[#edf0f4] pt-3 max-[560px]:grid-cols-1">
                  <label className="grid min-w-0 gap-[7px]">
                    <span className={FIELD_LABEL}>복구 대상 Version</span>
                    <select className={FIELD_INPUT} value={rollbackTarget} onChange={(event) => setRollbackTarget(event.target.value)}>
                      {rollbackVersions.map((item) => <option key={item.knowledgeVersionId} value={item.knowledgeVersionId}>{shortId(item.knowledgeVersionId)} · {item.status}</option>)}
                    </select>
                  </label>
                  <button className={BUTTON_DANGER} onClick={rollbackKnowledge} disabled={!rollbackTarget || busy !== null}>{busy === 'rollback-knowledge' ? '복구 중…' : '이 Version으로 복구'}</button>
                </div>
              )}
            </>
          )}
        </SectionCard>

        <SectionCard step="04" title="Chatbot RAG" description="Client는 Project나 Knowledge version을 보내지 않고 서버 Active pointer를 따릅니다." state={ragResult?.outcome ?? chatbot?.status}>
          {!chatbot && <button className={BUTTON_PRIMARY} onClick={createChatbot} disabled={!knowledgeBase?.activeVersionId || busy !== null}>{busy === 'create-chatbot' ? '연결 중…' : 'Active Knowledge에 Chatbot 연결'}</button>}
          {chatbot && (
            <form className="grid gap-[9px]" onSubmit={askChatbot}>
              <label className="grid min-w-0 gap-[7px]">
                <span className={FIELD_LABEL}>질문</span>
                <textarea className={`${FIELD_INPUT} resize-y leading-[1.55]`} value={query} onChange={(event) => setQuery(event.target.value)} minLength={1} maxLength={4000} rows={3} required />
              </label>
              <button className={`${BUTTON_PRIMARY} justify-self-end`} disabled={busy !== null || !query.trim()}>{busy === 'query-rag' ? '검색·생성 중…' : 'Active RAG에 질문'}</button>
            </form>
          )}
          {ragResult && (
            <div
              className={`grid gap-[11px] rounded-[9px] border p-[14px] ${
                ragResult.outcome.toLowerCase() === 'answered'
                  ? 'border-[#cbeadf] bg-[#f1faf7]'
                  : 'border-[#efcdd2] bg-[#fff5f5]'
              }`}
            >
              <header className="flex items-center justify-between text-[9px] text-[#6e7787]">
                <StatusBadge status={ragResult.outcome} />
                <span>Knowledge {shortId(ragResult.knowledgeVersionId)}</span>
              </header>
              <p className="m-0 text-xs leading-[1.7] text-[#2c3543]">{ragResult.answer}</p>
              {ragResult.citations.length > 0 && (
                <ul className="m-0 grid list-none gap-[7px] p-0">
                  {ragResult.citations.map((citation) => (
                    <li key={`${citation.documentId}-${citation.sourceUrl}`} className="grid gap-[3px] border-t border-black/[0.07] pt-2">
                      <a className="w-fit text-[10px] font-bold text-[#5847cf]" href={citation.sourceUrl} target="_blank" rel="noreferrer">{citation.title}</a>
                      {citation.excerpt && <span className="text-[9px] leading-[1.5] text-[#6c7686]">{citation.excerpt}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </SectionCard>

        <section className="col-span-2 min-w-0 rounded-2xl border border-line bg-panel shadow-[0_7px_28px_rgba(31,43,65,0.045)] max-[1120px]:col-span-1">
          <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-b border-[#edf0f4] px-[19px] py-[18px] max-[560px]:grid-cols-[auto_1fr]">
            <span className="grid h-[31px] w-[31px] place-items-center rounded-lg bg-[#f0edff] font-mono text-[10px] font-extrabold leading-none text-purple">05</span>
            <div>
              <h2 className="mb-[5px] mt-0 text-[15px] tracking-[-0.015em]">Authoritative Agent Jobs</h2>
              <p className="m-0 text-[11px] leading-[1.55] text-[#7a8496]">Queue·Batch 상태가 아닌 Spring/Core DB product state를 표시합니다.</p>
            </div>
            <span className={`${STATUS_BADGE_BASE} ${STATUS_BADGE_TONE_CLASSES.neutral} max-[560px]:col-start-2`}>{jobs.length} JOBS</span>
          </header>
          <div className="grid">
            {jobs.length === 0 && <p className="m-0 p-7 text-center text-[11px] text-[#8a94a5]">아직 실행한 Job이 없습니다.</p>}
            {jobs.map((job) => (
              <article
                className="relative grid grid-cols-[minmax(210px,1.1fr)_minmax(210px,1fr)_auto_auto] items-center gap-[15px] border-b border-[#edf0f4] px-[19px] py-[15px] last:border-b-0 max-[1120px]:grid-cols-[minmax(190px,1fr)_minmax(180px,1fr)] max-[560px]:grid-cols-1"
                key={job.jobId}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <StatusBadge status={job.status} />
                  <strong className="text-[11px]">{job.jobType}</strong>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[9px] leading-none text-[#8892a2]">{shortId(job.jobId)} · v{job.stateVersion}</span>
                </div>
                <div className="relative h-6 overflow-hidden rounded-md bg-[#edf0f5]">
                  <span
                    className="absolute inset-y-0 left-0 rounded-[inherit] bg-[linear-gradient(90deg,#7866ef,#aa9df7)] transition-[width] duration-[320ms] ease-in-out"
                    style={{ width: `${job.progress.percent}%` }}
                  />
                  <strong className="relative z-[1] grid h-full place-items-center font-mono text-[8px] font-extrabold leading-none text-[#242b38]">{job.progress.phase ?? 'QUEUED'} · {job.progress.percent}%</strong>
                </div>
                <div className="flex flex-wrap gap-[9px] whitespace-nowrap text-[9px] text-[#7c8798] max-[1120px]:justify-end max-[560px]:justify-start">
                  <span>{job.progress.successCount ?? 0} 성공</span>
                  <span>{job.progress.failedCount ?? 0} 실패</span>
                  <span>{formatTime(job.updatedAt)}</span>
                </div>
                {job.failure && <p className="col-span-full -mt-1 mb-0 text-[10px] text-[#b23a4a]">{job.failure.message} [{job.failure.code}]</p>}
                <div className="flex gap-[6px] max-[1120px]:justify-end max-[560px]:justify-start">
                  {job.status === 'FAILED' && job.failure?.retryable && <button className={BUTTON_SECONDARY} onClick={() => retryJob(job)} disabled={busy !== null}>재시도</button>}
                  {['QUEUED', 'RUNNING'].includes(job.status) && <button className={BUTTON_DANGER} onClick={() => cancelJob(job)} disabled={busy !== null}>취소</button>}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
