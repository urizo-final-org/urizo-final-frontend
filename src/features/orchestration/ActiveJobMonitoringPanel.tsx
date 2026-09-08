import { useEffect, useRef, useState } from 'react'
import { describeFailure } from '../../shared/api/error'
import { Badge, Callout, PanelTitle, control, panel, secondaryButton, type Tone } from '../../shared/ui/primitives'
import type {
  AgentSettingsApiClient, MonitoringJobSnapshotResponse, MonitoringLatestNodeState,
  MonitoringNodeDisplayStatus, ProfileEditorLayout, ProfileKey, ProfileVersion, SelectedObservationsResponse,
} from './api'

const POLL_MS = 1_000
const NODE_WIDTH = 176
const NODE_HEIGHT = 92

const statusView: Record<MonitoringNodeDisplayStatus, { label: string; tone: Tone; line: string }> = {
  NOT_STARTED: { label: '대기', tone: 'idle', line: '#8f9aa8' },
  RUNNING: { label: '진행 중', tone: 'run', line: '#2f8de4' },
  WAITING_APPROVAL: { label: '승인 대기', tone: 'wait', line: '#d97706' },
  COMPLETED: { label: '완료', tone: 'ok', line: '#2f855a' },
  FAILED: { label: '실패', tone: 'fail', line: '#c2413b' },
}

export default function ActiveJobMonitoringPanel({ api }: { api: AgentSettingsApiClient }) {
  const [jobs, setJobs] = useState<Awaited<ReturnType<AgentSettingsApiClient['listMonitoringJobs']>>['jobs']>([])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [snapshot, setSnapshot] = useState<MonitoringJobSnapshotResponse | null>(null)
  const [profile, setProfile] = useState<ProfileVersion | null>(null)
  const [layout, setLayout] = useState<ProfileEditorLayout | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [selectedProviderLabel, setSelectedProviderLabel] = useState('관측 대기')
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [listFailure, setListFailure] = useState<string | null>(null)
  const [snapshotFailure, setSnapshotFailure] = useState<string | null>(null)
  const [profileFailure, setProfileFailure] = useState<string | null>(null)
  const listRequest = useRef(0)
  const latestSnapshot = useRef<MonitoringJobSnapshotResponse | null>(null)

  async function loadJobs(signal?: AbortSignal) {
    const request = ++listRequest.current
    setLoadingJobs(true)
    setListFailure(null)
    try {
      const response = await api.listMonitoringJobs(signal)
      if (request !== listRequest.current) return
      const active = response.jobs.filter((job) => !job.domainTerminal)
      setJobs(active)
      setSelectedJobId((current) => active.some((job) => job.jobId === current)
        ? current
        : active.length === 1 ? active[0].jobId : '')
    } catch (error) {
      if (signal?.aborted || request !== listRequest.current) return
      setListFailure(describeFailure(error))
    } finally {
      if (request === listRequest.current) setLoadingJobs(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void loadJobs(controller.signal)
    return () => { controller.abort(); listRequest.current += 1 }
  }, [api])

  const selectedJob = jobs.find((job) => job.jobId === selectedJobId) ?? null
  const shownJob = snapshot?.job ?? selectedJob

  useEffect(() => {
    setSnapshot(null)
    latestSnapshot.current = null
    setSnapshotFailure(null)
    setSelectedNodeId('')
    if (!selectedJobId) return

    let disposed = false
    let terminal = false
    let requestGeneration = 0
    let timer: number | undefined
    let controller: AbortController | undefined

    const poll = async () => {
      if (disposed || terminal || document.hidden) return
      const generation = ++requestGeneration
      const localController = new AbortController()
      controller = localController
      try {
        const next = await api.getMonitoringJobSnapshot(selectedJobId, localController.signal)
        if (disposed || terminal || generation !== requestGeneration || localController.signal.aborted
          || document.hidden || next.job.jobId !== selectedJobId) return
        const current = latestSnapshot.current
        const accepted = !current || (next.job.monitorRevision >= current.job.monitorRevision
          && next.job.stateVersion >= current.job.stateVersion)
        if (accepted) {
          latestSnapshot.current = next
          setSnapshot(next)
          setSelectedNodeId((current) => next.latestNodeStates.some((node) => node.nodeId === current)
            ? current
            : next.job.currentNode?.nodeId ?? next.latestNodeStates[0]?.nodeId ?? '')
          setSnapshotFailure(null)
          if (next.job.domainTerminal) { terminal = true; return }
        }
      } catch (error) {
        if (!localController.signal.aborted && !disposed && generation === requestGeneration) setSnapshotFailure(describeFailure(error))
      }
      if (!disposed && !terminal && !document.hidden && generation === requestGeneration) timer = window.setTimeout(() => void poll(), POLL_MS)
    }

    const visibilityChanged = () => {
      if (document.hidden) {
        requestGeneration += 1
        if (timer !== undefined) window.clearTimeout(timer)
        controller?.abort()
      } else if (!terminal) {
        if (timer !== undefined) window.clearTimeout(timer)
        void poll()
      }
    }

    document.addEventListener('visibilitychange', visibilityChanged)
    void poll()
    return () => {
      disposed = true
      requestGeneration += 1
      if (timer !== undefined) window.clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [api, selectedJobId])

  useEffect(() => {
    setProfile(null)
    setLayout(null)
    setProfileFailure(null)
    if (!selectedJob) return
    if (selectedJob.profileKey !== 'LLM_OPS' && selectedJob.profileKey !== 'NATURAL_CMS') {
      setProfileFailure(`지원하지 않는 Profile입니다: ${selectedJob.profileKey}`)
      return
    }
    let active = true
    setLoadingProfile(true)
    void Promise.all([
      api.list(selectedJob.profileKey as ProfileKey),
      api.getEditorLayout(selectedJob.profileVersionId),
    ]).then(([versions, nextLayout]) => {
      if (!active) return
      const fixed = versions.find((version) => version.profileVersionId === selectedJob.profileVersionId)
      if (!fixed) throw new Error('Job이 고정한 Profile Version을 찾을 수 없습니다.')
      if (nextLayout.profileVersionId !== selectedJob.profileVersionId) {
        throw new Error('Job Profile Version과 저장 Layout이 일치하지 않습니다.')
      }
      setProfile(fixed)
      setLayout(nextLayout)
    }).catch((error) => {
      if (active) setProfileFailure(describeFailure(error))
    }).finally(() => { if (active) setLoadingProfile(false) })
    return () => { active = false }
  }, [api, selectedJob])

  return <section id="agent-settings-panel-monitoring" role="tabpanel" aria-labelledby="agent-settings-tab-monitoring">
    <Callout tone="ok" icon="activity">Spring Monitoring 상태와 Job이 고정한 Profile Version을 읽기 전용으로 표시합니다.</Callout>
    <section className={`${panel} mt-3 p-4`} aria-label="활성 Job 선택">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1 text-[0.71875rem] font-semibold text-body">활성 Job
          <select aria-label="실행 모니터링 Job" className={control} value={selectedJobId} disabled={loadingJobs || jobs.length === 0}
            onChange={(event) => setSelectedJobId(event.target.value)}>
            {jobs.length === 0 && <option value="">선택할 활성 Job 없음</option>}
            {jobs.map((job) => <option key={job.jobId} value={job.jobId}>{job.profileKey} · {job.domainJobStatus} · {job.jobId}</option>)}
          </select>
        </label>
        <button type="button" className={secondaryButton} disabled={loadingJobs} onClick={() => void loadJobs()}>{loadingJobs ? '조회 중' : '목록 새로고침'}</button>
      </div>
      {listFailure && <p role="alert" className="mt-3 text-xs text-fail-fg">{listFailure}</p>}
      {!loadingJobs && !listFailure && jobs.length === 0 && <p className="mt-3 text-xs text-muted-2">현재 표시할 미종료 Job이 없습니다.</p>}
    </section>

    {selectedJob && <section className="mt-3 grid min-h-[38rem] gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]" aria-label="실행 모니터링 상세">
      <article className={`${panel} min-w-0 overflow-hidden`}>
        <PanelTitle title={`${selectedJob.profileKey} 실행 흐름`} sub={`Job ${selectedJob.jobId}`}>
          <Badge tone={shownJob?.domainTerminal ? 'idle' : 'run'} dot={false}>{shownJob?.domainJobStatus}</Badge>
        </PanelTitle>
        {snapshotFailure && <p role="alert" className="border-b border-line-soft px-4 py-2 text-xs text-fail-fg">마지막 정상 상태를 유지합니다. {snapshotFailure}</p>}
        {profileFailure && <p role="alert" className="border-b border-line-soft px-4 py-2 text-xs text-fail-fg">{profileFailure}</p>}
        {loadingProfile && <p className="p-4 text-xs text-muted-2">Job 고정 Profile과 저장 Layout을 조회하고 있습니다.</p>}
        {snapshot && profile && layout && <ReadOnlyMonitoringCanvas snapshot={snapshot} profile={profile} layout={layout}
          selectedNodeId={selectedNodeId} selectedProviderLabel={selectedProviderLabel} onSelectNode={setSelectedNodeId} />}
      </article>
      <NodeMonitoringDetail api={api} snapshot={snapshot} selectedNodeId={selectedNodeId} onProviderLabel={setSelectedProviderLabel} />
    </section>}
  </section>
}

function ReadOnlyMonitoringCanvas({ snapshot, profile, layout, selectedNodeId, selectedProviderLabel, onSelectNode }: {
  snapshot: MonitoringJobSnapshotResponse
  profile: ProfileVersion
  layout: ProfileEditorLayout
  selectedNodeId: string
  selectedProviderLabel: string
  onSelectNode: (nodeId: string) => void
}) {
  const positions = new Map(layout.nodes.map((node) => [node.id, node]))
  const completeLayout = profile.snapshot.nodes.every((node) => positions.has(node.id))
  if (!completeLayout) return <p role="alert" className="p-4 text-xs text-fail-fg">저장 Layout에 일부 Snapshot Node 좌표가 없습니다.</p>
  const width = Math.max(720, ...layout.nodes.map((node) => node.x + NODE_WIDTH + 48))
  const height = Math.max(420, ...layout.nodes.map((node) => node.y + NODE_HEIGHT + 48))
  const states = new Map(snapshot.latestNodeStates.map((node) => [node.nodeId, node]))

  return <div className="m-4 overflow-auto rounded-md border border-[#343c46] bg-[#20262e]" aria-label="읽기 전용 Node Canvas">
    <div className="relative bg-[#20262e] bg-[radial-gradient(circle,#596472_1px,transparent_1px)] [background-size:20px_20px]" style={{ width, height }}>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        {profile.snapshot.edges.map((edge) => {
          const from = positions.get(edge.from)
          const to = positions.get(edge.to)
          if (!from || !to) return null
          const x1 = from.x + NODE_WIDTH
          const y1 = from.y + NODE_HEIGHT / 2
          const x2 = to.x
          const y2 = to.y + NODE_HEIGHT / 2
          const bend = Math.max(48, Math.abs(x2 - x1) * .45)
          return <path key={`${edge.from}:${edge.resultPort}:${edge.to}`} d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
            fill="none" stroke="#8f9aa8" strokeWidth="1.75" strokeLinecap="round" />
        })}
      </svg>
      {profile.snapshot.nodes.map((node) => {
        const position = positions.get(node.id)!
        const state = states.get(node.id)
        const view = statusView[state?.status ?? 'NOT_STARTED']
        const selected = selectedNodeId === node.id
        return <button key={node.id} type="button" aria-label={`${node.id} Node`} aria-pressed={selected}
          className="workflow-node-card absolute rounded-lg border bg-field p-3 text-left shadow-[0_8px_22px_#070a0e59]"
          style={{ left: position.x, top: position.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT, borderColor: view.line, borderWidth: selected ? 3 : 2 }}
          onClick={() => onSelectNode(node.id)}>
          <span className="block truncate text-[0.75rem] font-semibold">{node.id}</span>
          <span className="mt-1 block truncate font-mono text-[0.5625rem] text-muted-2">{node.handlerKey}</span>
          <span className="mt-2 flex flex-wrap items-center gap-1 text-[0.5625rem]">
            <span className="rounded bg-sub px-1.5 py-0.5">N · {view.label}</span>
            <span className="rounded bg-sub px-1.5 py-0.5 text-muted-2">P · {selected ? selectedProviderLabel : '미조회'}</span>
            <span className="rounded bg-sub px-1.5 py-0.5 text-muted-2">Q · 미설정</span>
          </span>
        </button>
      })}
    </div>
  </div>
}

function NodeMonitoringDetail({ api, snapshot, selectedNodeId, onProviderLabel }: { api: AgentSettingsApiClient; snapshot: MonitoringJobSnapshotResponse | null; selectedNodeId: string; onProviderLabel: (label: string) => void }) {
  const node = snapshot?.latestNodeStates.find((item) => item.nodeId === selectedNodeId) ?? null
  const occurrences = snapshot?.occurrences.filter((item) => item.nodeId === selectedNodeId) ?? []
  const selectedOccurrence = [...occurrences].sort((left, right) => right.pipelineAttempt - left.pipelineAttempt
    || right.executionAttempt - left.executionAttempt || right.nodeSequence - left.nodeSequence)[0] ?? null
  const providerSelection = selectedOccurrence ? {
    jobId: selectedOccurrence.jobId, profileVersionId: selectedOccurrence.profileVersionId,
    pipelineAttempt: selectedOccurrence.pipelineAttempt, executionAttempt: selectedOccurrence.executionAttempt,
    nodeId: selectedOccurrence.nodeId, nodeSequence: selectedOccurrence.nodeSequence,
    observationsPath: selectedOccurrence.observationsPath,
  } : snapshot && node?.pipelineAttempt != null && node.executionAttempt != null && node.nodeSequence != null ? {
    jobId: snapshot.job.jobId, profileVersionId: snapshot.job.profileVersionId,
    pipelineAttempt: node.pipelineAttempt, executionAttempt: node.executionAttempt,
    nodeId: node.nodeId, nodeSequence: node.nodeSequence,
    observationsPath: `/api/admin/ai/monitoring/jobs/${encodeURIComponent(snapshot.job.jobId)}/occurrences/${node.pipelineAttempt}/${node.executionAttempt}/${node.nodeSequence}/observations`,
  } : null
  const [provider, setProvider] = useState<SelectedObservationsResponse | null>(null)
  const [providerFailure, setProviderFailure] = useState<string | null>(null)
  const [providerReload, setProviderReload] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!selectedOccurrence?.startedAt || selectedOccurrence.status !== 'RUNNING') return
    setNowMs(Date.now())
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [selectedOccurrence?.jobId, selectedOccurrence?.pipelineAttempt,
    selectedOccurrence?.executionAttempt, selectedOccurrence?.nodeSequence,
    selectedOccurrence?.startedAt, selectedOccurrence?.status])

  useEffect(() => {
    setProvider(null)
    setProviderFailure(null)
    if (!providerSelection) return
    let active = true
    const controller = new AbortController()
    void api.getMonitoringOccurrenceObservations(providerSelection.observationsPath, controller.signal).then((response) => {
      if (!active || response.jobId !== providerSelection.jobId
        || response.profileVersionId !== providerSelection.profileVersionId
        || response.pipelineAttempt !== providerSelection.pipelineAttempt
        || response.executionAttempt !== providerSelection.executionAttempt
        || response.nodeId !== providerSelection.nodeId
        || response.nodeSequence !== providerSelection.nodeSequence) return
      setProvider(response)
    }).catch((error) => {
      if (active && !controller.signal.aborted) setProviderFailure(describeFailure(error))
    })
    return () => { active = false; controller.abort() }
  }, [api, providerSelection?.jobId, providerSelection?.profileVersionId,
    providerSelection?.pipelineAttempt, providerSelection?.executionAttempt,
    providerSelection?.nodeId, providerSelection?.nodeSequence,
    providerSelection?.observationsPath, snapshot?.job.monitorRevision, providerReload])

  useEffect(() => {
    if (!providerSelection || providerFailure) onProviderLabel('미제공')
    else if (!provider) onProviderLabel('관측 대기')
    else if (provider.status === 'UNCONNECTED') onProviderLabel('연결 안 됨')
    else if (provider.status === 'AVAILABLE' && provider.observations.length > 0) onProviderLabel('연결됨')
    else if (provider.status === 'AVAILABLE') onProviderLabel('관측 대기')
    else onProviderLabel(provider.status)
  }, [providerSelection?.observationsPath, provider, providerFailure, onProviderLabel])

  const elapsedEnd = selectedOccurrence?.status === 'COMPLETED' ? selectedOccurrence.completedAt
    : selectedOccurrence?.status === 'FAILED' ? selectedOccurrence.failedAt : null
  const elapsedSeconds = selectedOccurrence?.startedAt
    ? Math.max(0, Math.floor(((elapsedEnd ? Date.parse(elapsedEnd) : nowMs) - Date.parse(selectedOccurrence.startedAt)) / 1_000))
    : null
  return <aside className={`${panel} overflow-y-auto`} aria-label="선택 Node 모니터링 상세">
    <PanelTitle title="Node 상세" sub={selectedNodeId || 'Node를 선택하세요'} />
    {!node && <p className="p-4 text-xs text-muted-2">Canvas에서 Node를 선택하면 상세를 표시합니다.</p>}
    {node && <div className="space-y-4 p-4 text-[0.6875rem]">
      <section aria-label="N 상태 상세" className="rounded-md border border-line-soft bg-sub p-3">
        <b>N · 실행 상태</b>
        <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-2"><dt>상태</dt><dd>{statusView[node.status].label}</dd><dt>Pipeline</dt><dd>{node.pipelineAttempt ?? '제공되지 않음'}</dd><dt>실행 Attempt</dt><dd>{node.executionAttempt ?? '제공되지 않음'}</dd><dt>Sequence</dt><dd>{node.nodeSequence ?? '제공되지 않음'}</dd><dt>진행 시간</dt><dd>{elapsedSeconds === null ? '제공되지 않음' : `${elapsedSeconds}초`}</dd><dt>마지막 갱신</dt><dd>{node.lastUpdatedAt ?? '제공되지 않음'}</dd></dl>
      </section>
      <section aria-label="P Provider 상세" className="rounded-md border border-line-soft bg-sub p-3"><b>P · Provider 계측</b>
        {!providerSelection && <p className="mt-2 text-muted-2">P 조회 식별자가 제공되지 않았습니다.</p>}
        {providerFailure && <p role="alert" className="mt-2 text-fail-fg">{providerFailure}</p>}
        {provider?.status === 'UNCONNECTED' && <p className="mt-2 text-muted-2">관측 연결 안 됨 · {provider.errorCode}</p>}
        {provider && provider.status !== 'AVAILABLE' && provider.status !== 'UNCONNECTED' && <p className="mt-2 text-muted-2">{provider.status} · {provider.errorCode}</p>}
        {provider?.status === 'AVAILABLE' && provider.observations.length === 0 && <p className="mt-2 text-muted-2">관측 대기</p>}
        {provider?.status === 'AVAILABLE' && provider.observations.map((row) => <dl key={row.id} className="mt-2 grid grid-cols-[4rem_1fr] gap-1 border-t border-line-soft pt-2"><dt>Provider</dt><dd>{row.metadata.provider ?? '제공되지 않음'}</dd><dt>Model</dt><dd>{row.metadata.model ?? row.model ?? '제공되지 않음'}</dd><dt>Token</dt><dd>{row.inputTokens ?? '제공되지 않음'} / {row.outputTokens ?? '제공되지 않음'}</dd><dt>지연</dt><dd>{row.latencyMs === null ? '제공되지 않음' : `${row.latencyMs} ms`}</dd></dl>)}
        {(provider?.status === 'UNCONNECTED' || providerFailure) && providerSelection && <button type="button" className={`${secondaryButton} mt-3`} onClick={() => setProviderReload((value) => value + 1)}>P 다시 조회</button>}
      </section>
      <section aria-label="Q 평가 상세" className="rounded-md border border-line-soft bg-sub p-3"><b>Q · 품질 평가</b><p className="mt-2 text-muted-2">평가 미설정</p></section>
      <section aria-label="Node occurrence 이력"><b>Occurrence</b>{snapshot?.truncated && <p className="mt-1 text-wait-fg">일부 과거 이력은 잘렸으며 최신 Node 상태는 유지됩니다.</p>}
        {occurrences.length === 0 ? <p className="mt-2 text-muted-2">기록 없음</p> : <ol className="mt-2 space-y-2">{occurrences.map((item) => <li key={`${item.pipelineAttempt}:${item.executionAttempt}:${item.nodeSequence}`} className="rounded border border-line-soft p-2"><b>{statusView[item.status].label}</b> · P{item.pipelineAttempt}/E{item.executionAttempt} · #{item.nodeSequence}{item.errorCode && <span className="block text-fail-fg">{item.errorCode}</span>}</li>)}</ol>}
      </section>
      {snapshot && <p className="border-t border-line-soft pt-3 text-muted-2">Job 상태: <b className="text-body">{snapshot.job.domainJobStatus}</b> · monitorRevision {snapshot.job.monitorRevision} · 마지막 갱신 {snapshot.job.lastUpdatedAt}</p>}
    </div>}
  </aside>
}
