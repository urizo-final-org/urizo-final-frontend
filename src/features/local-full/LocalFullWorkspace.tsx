import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { describeFailure } from '../../shared/api/error'
import { fetchProductSession } from '../../shared/api/session'
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

function StatusBadge({ status }: { status?: string }) {
  return <span className={`status-badge status-badge--${statusTone(status)}`}>{status ?? 'NOT READY'}</span>
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
    <section className="workflow-card">
      <header className="workflow-card__header">
        <span className="step-number">{step}</span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {state && <StatusBadge status={state} />}
      </header>
      <div className="workflow-card__body">{children}</div>
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

export default function LocalFullWorkspace() {
  const [api, setApi] = useState<ProductApi | null>(null)
  const [bootNonce, setBootNonce] = useState(0)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [readinessError, setReadinessError] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null)
  const [actorId, setActorId] = useState<string | null>(null)

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
        const session = await fetchProductSession()
        if (cancelled) return
        const client = new ProductApi(session.bearerToken)
        setApi(client)
        setActorId(session.actorId ?? null)

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
    return <section className="workspace-loading" aria-live="polite"><span className="spinner" />Local full session과 Project context를 복원하는 중입니다…</section>
  }

  if (bootError) {
    return (
      <section className="workspace-loading workspace-loading--error" role="alert">
        <strong>Local full workspace를 시작하지 못했습니다.</strong>
        <span>{bootError}</span>
        <button className="button button--primary" onClick={() => setBootNonce((value) => value + 1)}>다시 연결</button>
      </section>
    )
  }

  return (
    <div className="local-full-workspace">
      <section className="page-heading page-heading--with-health">
        <div>
          <p className="section-label">Local full · Deterministic P0</p>
          <h1>Project에서 RAG 답변까지</h1>
          <p>브라우저 runtime mock 없이 Nginx와 Spring public API 경계를 그대로 사용하는 작업 화면입니다.</p>
        </div>
        <div className="health-cluster" aria-label="서비스 상태">
          <div><span>API</span><StatusBadge status={health?.status} /></div>
          <div><span>Readiness</span><StatusBadge status={readiness?.status} /></div>
          <div><span>Session</span><StatusBadge status={api ? 'READY' : undefined} /></div>
        </div>
      </section>

      {readinessError && (
        <div className="inline-alert inline-alert--warning" role="status">
          Readiness 확인 실패: {readinessError}. Product API 동작과 별도로 다시 점검하세요.
        </div>
      )}
      {notice && <div className={`inline-alert inline-alert--${notice.tone}`} role="status">{notice.text}</div>}

      <section className="context-strip">
        <div><span>Actor</span><strong>{actorId ? shortId(actorId) : 'local fixture actor'}</strong></div>
        <div><span>Project</span><strong>{project?.name ?? '아직 없음'}</strong></div>
        <div><span>Connector</span><strong>{connector?.name ?? '아직 없음'}</strong></div>
        <div><span>Active Knowledge</span><strong>{shortId(knowledgeBase?.activeVersionId)}</strong></div>
      </section>

      <div className="workflow-grid">
        <SectionCard step="01" title="Project context" description="생성 후 list/get 계약으로 새로고침 상태를 복원합니다." state={project?.status}>
          {projects.length > 0 && (
            <label className="field">
              <span>저장된 Project</span>
              <select value={project?.projectId ?? ''} onChange={(event) => void selectProject(event.target.value)} disabled={busy !== null}>
                {projects.map((item) => <option key={item.projectId} value={item.projectId}>{item.name}</option>)}
              </select>
            </label>
          )}
          <form className="compact-form" onSubmit={createProject}>
            <label className="field"><span>새 Project 이름</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} minLength={1} maxLength={120} required /></label>
            <label className="field field--wide"><span>설명</span><input value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} maxLength={2000} /></label>
            <button className="button button--primary" disabled={!api || busy !== null || !projectName.trim()}>{busy === 'create-project' ? '생성 중…' : 'Project 생성'}</button>
          </form>
        </SectionCard>

        <SectionCard step="02" title="Fixture Connector" description="실제 공공 API 대신 Backend deterministic adapter만 호출합니다." state={connector?.status}>
          <dl className="spec-list">
            <div><dt>Base URL</dt><dd>{localFixtureConnector.baseUrl}</dd></div>
            <div><dt>Items path</dt><dd>{localFixtureConnector.response.itemsPath}</dd></div>
            <div><dt>Version</dt><dd>{shortId(connector?.connectorVersionId)}</dd></div>
          </dl>
          <div className="action-row">
            {!connector && <button className="button button--primary" onClick={createConnector} disabled={!project || busy !== null}>{busy === 'create-connector' ? '저장 중…' : 'Fixture Connector 생성'}</button>}
            {connector && <button className="button button--secondary" onClick={previewConnector} disabled={busy !== null}>{busy === 'preview-connector' ? '확인 중…' : '응답 미리보기'}</button>}
            {connector?.status === 'DRAFT' && <button className="button button--primary" onClick={activateConnector} disabled={!preview || busy !== null}>{busy === 'activate-connector' ? '활성화 중…' : '검증 후 활성화'}</button>}
            {activeConnectorVersionId && <button className="button button--primary" onClick={syncConnector} disabled={busy !== null || connectorSyncRunning}>{busy === 'sync-connector' ? '등록 중…' : connectorSyncRunning ? 'Sync 실행 중…' : 'Connector Sync'}</button>}
          </div>
          {activeConnectorVersionId && !connectorSyncSucceeded && <p className="empty-copy">Sync Job이 성공하면 Knowledge Build 단계가 열립니다.</p>}
          {preview && (
            <div className="preview-panel">
              <header><strong>{preview.itemCount}개 정규화 문서</strong><span>{preview.truncated ? '일부만 표시' : '전체 fixture sample'}</span></header>
              {preview.documents.map((document) => (
                <article key={document.documentId}><span>{document.documentId}</span><h3>{document.title}</h3><p>{document.content}</p></article>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard step="03" title="Knowledge build" description="Build는 새 version을 만들며 기존 Active pointer를 자동 변경하지 않습니다." state={knowledgeBase?.activeVersionId ? 'ACTIVE' : latestPendingKnowledgeVersion?.status}>
          {knowledgeBases.length > 0 && (
            <label className="field">
              <span>Knowledge Base</span>
              <select value={knowledgeBase?.knowledgeBaseId ?? ''} onChange={(event) => selectKnowledgeBase(event.target.value)} disabled={busy !== null}>
                {knowledgeBases.map((item) => <option key={item.knowledgeBaseId} value={item.knowledgeBaseId}>{item.name}</option>)}
              </select>
            </label>
          )}
          {!knowledgeBase && (
            <form className="compact-form" onSubmit={createKnowledgeBase}>
              <label className="field field--wide"><span>Knowledge 이름</span><input value={knowledgeName} onChange={(event) => setKnowledgeName(event.target.value)} maxLength={120} required /></label>
              <button className="button button--primary" disabled={!project || busy !== null || !knowledgeName.trim()}>{busy === 'create-knowledge' ? '생성 중…' : 'Knowledge Base 생성'}</button>
            </form>
          )}
          {knowledgeBase && (
            <>
              <div className="version-summary">
                <div><span>Active</span><strong>{shortId(knowledgeBase.activeVersionId)}</strong></div>
                <div><span>Versions</span><strong>{knowledgeVersions.length}</strong></div>
                <div><span>Candidate</span><strong>{latestPendingKnowledgeVersion?.status ?? '—'}</strong></div>
              </div>
              <div className="action-row">
                <button className="button button--primary" onClick={startKnowledgeBuild} disabled={!activeConnectorVersionId || !connectorSyncSucceeded || knowledgeJobOutstanding || busy !== null}>{busy === 'start-build' ? '시작 중…' : knowledgeJobOutstanding ? 'Build 진행 중…' : 'Knowledge Build'}</button>
                <button className="button button--primary" onClick={activateKnowledgeVersion} disabled={!candidateKnowledgeVersion || busy !== null}>{busy === 'activate-knowledge' ? '전환 중…' : 'Candidate 활성화'}</button>
              </div>
              {rollbackVersions.length > 0 && (
                <div className="rollback-row">
                  <label className="field"><span>복구 대상 Version</span><select value={rollbackTarget} onChange={(event) => setRollbackTarget(event.target.value)}>{rollbackVersions.map((item) => <option key={item.knowledgeVersionId} value={item.knowledgeVersionId}>{shortId(item.knowledgeVersionId)} · {item.status}</option>)}</select></label>
                  <button className="button button--danger" onClick={rollbackKnowledge} disabled={!rollbackTarget || busy !== null}>{busy === 'rollback-knowledge' ? '복구 중…' : '이 Version으로 복구'}</button>
                </div>
              )}
            </>
          )}
        </SectionCard>

        <SectionCard step="04" title="Chatbot RAG" description="Client는 Project나 Knowledge version을 보내지 않고 서버 Active pointer를 따릅니다." state={ragResult?.outcome ?? chatbot?.status}>
          {!chatbot && <button className="button button--primary" onClick={createChatbot} disabled={!knowledgeBase?.activeVersionId || busy !== null}>{busy === 'create-chatbot' ? '연결 중…' : 'Active Knowledge에 Chatbot 연결'}</button>}
          {chatbot && (
            <form className="query-form" onSubmit={askChatbot}>
              <label className="field"><span>질문</span><textarea value={query} onChange={(event) => setQuery(event.target.value)} minLength={1} maxLength={4000} rows={3} required /></label>
              <button className="button button--primary" disabled={busy !== null || !query.trim()}>{busy === 'query-rag' ? '검색·생성 중…' : 'Active RAG에 질문'}</button>
            </form>
          )}
          {ragResult && (
            <div className={`rag-result rag-result--${ragResult.outcome.toLowerCase()}`}>
              <header><StatusBadge status={ragResult.outcome} /><span>Knowledge {shortId(ragResult.knowledgeVersionId)}</span></header>
              <p>{ragResult.answer}</p>
              {ragResult.citations.length > 0 && <ul>{ragResult.citations.map((citation) => <li key={`${citation.documentId}-${citation.sourceUrl}`}><a href={citation.sourceUrl} target="_blank" rel="noreferrer">{citation.title}</a>{citation.excerpt && <span>{citation.excerpt}</span>}</li>)}</ul>}
            </div>
          )}
        </SectionCard>

        <section className="workflow-card workflow-card--wide">
          <header className="workflow-card__header">
            <span className="step-number">05</span>
            <div><h2>Authoritative Agent Jobs</h2><p>Queue·Batch 상태가 아닌 Spring/Core DB product state를 표시합니다.</p></div>
            <span className="status-badge status-badge--neutral">{jobs.length} JOBS</span>
          </header>
          <div className="job-list">
            {jobs.length === 0 && <p className="empty-copy">아직 실행한 Job이 없습니다.</p>}
            {jobs.map((job) => (
              <article className="job-row" key={job.jobId}>
                <div><StatusBadge status={job.status} /><strong>{job.jobType}</strong><span>{shortId(job.jobId)} · v{job.stateVersion}</span></div>
                <div className="job-progress"><span style={{ width: `${job.progress.percent}%` }} /><strong>{job.progress.phase ?? 'QUEUED'} · {job.progress.percent}%</strong></div>
                <div className="job-meta"><span>{job.progress.successCount ?? 0} 성공</span><span>{job.progress.failedCount ?? 0} 실패</span><span>{formatTime(job.updatedAt)}</span></div>
                {job.failure && <p className="job-failure">{job.failure.message} [{job.failure.code}]</p>}
                <div className="job-actions">
                  {job.status === 'FAILED' && job.failure?.retryable && <button className="button button--secondary" onClick={() => retryJob(job)} disabled={busy !== null}>재시도</button>}
                  {['QUEUED', 'RUNNING'].includes(job.status) && <button className="button button--danger" onClick={() => cancelJob(job)} disabled={busy !== null}>취소</button>}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
