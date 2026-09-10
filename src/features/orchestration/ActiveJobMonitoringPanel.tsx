import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import './ActiveJobMonitoringPanel.css'
import { describeFailure } from '../../shared/api/error'
import { Badge, Callout, PanelTitle, control, panel, secondaryButton, type Tone } from '../../shared/ui/primitives'
import { nodeDisplayName } from './WorkflowPanel'
import type {
  AgentSettingsApiClient, MonitoringJobSnapshotResponse, MonitoringLatestNodeState,
  MonitoringNodeDisplayStatus, ProfileEditorLayout, ProfileKey, ProfileVersion, SelectedObservationsResponse,
} from './api'

const POLL_MS = 1_000
const JOB_LIST_POLL_MS = 5_000
const NODE_WIDTH = 176
const NODE_HEIGHT = 112

const statusView: Record<MonitoringNodeDisplayStatus, { label: string; tone: Tone; line: string }> = {
  NOT_STARTED: { label: '대기', tone: 'idle', line: '#8f9aa8' },
  RUNNING: { label: '진행 중', tone: 'run', line: '#2f8de4' },
  WAITING_APPROVAL: { label: '승인 대기', tone: 'wait', line: '#d97706' },
  COMPLETED: { label: '완료', tone: 'ok', line: '#2f855a' },
  FAILED: { label: '실패', tone: 'fail', line: '#c2413b' },
}

export default function ActiveJobMonitoringPanel({ api, requestedJobId = '' }: { api: AgentSettingsApiClient; requestedJobId?: string }) {
  const [jobs, setJobs] = useState<Awaited<ReturnType<AgentSettingsApiClient['listMonitoringJobs']>>['jobs']>([])
  const [selectedJobId, setSelectedJobId] = useState(requestedJobId)
  const [followingLatest, setFollowingLatest] = useState(!requestedJobId)
  const followLatest = useRef(!requestedJobId)
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
  const [listReload, setListReload] = useState(0)
  const latestSnapshot = useRef<MonitoringJobSnapshotResponse | null>(null)

  useEffect(() => {
    followLatest.current = !requestedJobId
    setFollowingLatest(!requestedJobId)
    setSelectedJobId(requestedJobId)
  }, [requestedJobId])

  useEffect(() => {
    let disposed = false
    let timer: number | undefined
    let controller: AbortController | undefined
    const poll = async () => {
      if (disposed || document.hidden || controller) return
      const localController = new AbortController()
      controller = localController
      setLoadingJobs(true)
      try {
        const response = await api.listMonitoringJobs(localController.signal)
        if (disposed || localController.signal.aborted || document.hidden) return
        setJobs(response.jobs)
        // The API orders active Jobs by their latest monitoring update. Explicit selections stay pinned.
        const latestActive = response.jobs.find((job) => !job.domainTerminal)
        if (followLatest.current && latestActive) setSelectedJobId(latestActive.jobId)
        setListFailure(null)
      } catch (error) {
        if (!disposed && !localController.signal.aborted) setListFailure(describeFailure(error))
      } finally {
        if (!disposed && controller === localController) {
          controller = undefined
          setLoadingJobs(false)
          if (!document.hidden) timer = window.setTimeout(() => void poll(), JOB_LIST_POLL_MS)
        }
      }
    }
    const visibilityChanged = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      if (document.hidden) {
        controller?.abort()
        controller = undefined
        setLoadingJobs(false)
      } else void poll()
    }
    document.addEventListener('visibilitychange', visibilityChanged)
    void poll()
    return () => {
      disposed = true
      if (timer !== undefined) window.clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [api, listReload])

  const selectedSnapshot = snapshot?.job.jobId === selectedJobId ? snapshot : null
  const selectedJob = jobs.find((job) => job.jobId === selectedJobId) ?? selectedSnapshot?.job ?? null
  const shownJob = selectedSnapshot?.job ?? selectedJob
  const listedJobs = selectedJob && !jobs.some((job) => job.jobId === selectedJobId) ? [...jobs, selectedJob] : jobs
  const selectedProfileKey = selectedJob?.profileKey
  const selectedProfileVersionId = selectedJob?.profileVersionId

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
    setLoadingProfile(false)
    if (!selectedProfileKey || !selectedProfileVersionId) return
    if (selectedProfileKey !== 'LLM_OPS' && selectedProfileKey !== 'NATURAL_CMS') {
      setProfileFailure(`지원하지 않는 Profile입니다: ${selectedProfileKey}`)
      return
    }
    let active = true
    setLoadingProfile(true)
    void Promise.all([
      api.list(selectedProfileKey as ProfileKey),
      api.getEditorLayout(selectedProfileVersionId),
    ]).then(([versions, nextLayout]) => {
      if (!active) return
      const fixed = versions.find((version) => version.profileVersionId === selectedProfileVersionId)
      if (!fixed) throw new Error('Job이 고정한 Profile Version을 찾을 수 없습니다.')
      if (nextLayout.profileVersionId !== selectedProfileVersionId) {
        throw new Error('Job Profile Version과 저장 Layout이 일치하지 않습니다.')
      }
      setProfile(fixed)
      setLayout(nextLayout)
    }).catch((error) => {
      if (active) setProfileFailure(describeFailure(error))
    }).finally(() => { if (active) setLoadingProfile(false) })
    return () => { active = false }
  }, [api, selectedProfileKey, selectedProfileVersionId])

  return <section id="agent-settings-panel-monitoring" role="tabpanel" aria-labelledby="agent-settings-tab-monitoring">
    <Callout tone="ok" icon="activity">Spring Monitoring 상태와 Job이 고정한 Profile Version을 읽기 전용으로 표시합니다.</Callout>
    <section className={`${panel} mt-3 p-4`} aria-label="모니터링 Job 선택">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1 text-[0.71875rem] font-semibold text-body">활성·최근 종료 Job
          <select aria-label="실행 모니터링 Job" className={control} value={selectedJobId} disabled={listedJobs.length === 0}
            onChange={(event) => { followLatest.current = false; setFollowingLatest(false); setSelectedJobId(event.target.value) }}>
            <option value="" disabled>{listedJobs.length === 0 ? '선택할 Job 없음' : '모니터링할 Job을 선택하세요'}</option>
            {listedJobs.map((job) => <option key={job.jobId} value={job.jobId}>{job.domainTerminal ? '[종료] ' : '[활성] '}{job.profileKey} · {job.domainJobStatus} · {job.jobId}</option>)}
          </select>
        </label>
        <button type="button" className={secondaryButton} disabled={loadingJobs} onClick={() => setListReload((value) => value + 1)}>{loadingJobs ? '조회 중' : '목록 새로고침'}</button>
        <button type="button" className={secondaryButton} aria-pressed={followingLatest} onClick={() => {
          followLatest.current = !followingLatest
          setFollowingLatest(!followingLatest)
          if (!followingLatest) {
            const latestActive = jobs.find((job) => !job.domainTerminal)
            if (latestActive) setSelectedJobId(latestActive.jobId)
          }
        }}>최신 활성 Job 자동 추적 {followingLatest ? '켜짐' : '꺼짐'}</button>
      </div>
      {listFailure && <p role="alert" className="mt-3 text-xs text-fail-fg">{listFailure}</p>}
      {snapshotFailure && !selectedJob && <p role="alert" className="mt-3 text-xs text-fail-fg">요청한 Job을 불러오지 못했습니다. {snapshotFailure}</p>}
      <p className="mt-3 text-xs text-muted-2">목록은 화면이 보이는 동안 5초마다, 실행 상태는 1초마다 갱신됩니다. 자동 추적은 최근 상태가 갱신된 활성 Job을 표시합니다. 직접 선택한 Job은 그대로 유지됩니다.</p>
      {!loadingJobs && !listFailure && listedJobs.length === 0 && <p className="mt-3 text-xs text-muted-2">현재 표시할 Job이 없습니다.</p>}
    </section>

    {selectedJob && <section className="mt-3 grid min-h-[38rem] gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]" aria-label="실행 모니터링 상세">
      <article className={`${panel} min-w-0 overflow-hidden`}>
        <PanelTitle title={`${selectedJob.profileKey} 실행 흐름`} sub={`Job ${selectedJob.jobId}`}>
          <Badge tone={shownJob?.domainTerminal ? 'idle' : 'run'} dot={false}>{shownJob?.domainJobStatus}</Badge>
        </PanelTitle>
        {snapshotFailure && <p role="alert" className="border-b border-line-soft px-4 py-2 text-xs text-fail-fg">마지막 정상 상태를 유지합니다. {snapshotFailure}</p>}
        {profileFailure && <p role="alert" className="border-b border-line-soft px-4 py-2 text-xs text-fail-fg">{profileFailure}</p>}
        {loadingProfile && <p className="p-4 text-xs text-muted-2">Job 고정 Profile과 저장 Layout을 조회하고 있습니다.</p>}
        {selectedSnapshot && profile && layout && <ReadOnlyMonitoringCanvas key={selectedSnapshot.job.jobId} snapshot={selectedSnapshot} profile={profile} layout={layout}
          selectedNodeId={selectedNodeId} selectedProviderLabel={selectedProviderLabel} onSelectNode={setSelectedNodeId} />}
      </article>
      <NodeMonitoringDetail api={api} snapshot={selectedSnapshot} selectedNodeId={selectedNodeId} onProviderLabel={setSelectedProviderLabel} />
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
  const viewportRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  const zoomAnchor = useRef<{ left: number; top: number } | null>(null)
  const pan = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null)
  const [panning, setPanning] = useState(false)
  const positions = new Map(layout.nodes.map((node) => [node.id, node]))
  const completeLayout = profile.snapshot.nodes.every((node) => positions.has(node.id))

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const wheel = (event: WheelEvent) => {
      // Consume even a clamped or horizontal wheel: the surrounding page must not scroll.
      event.preventDefault()
      event.stopPropagation()
      if (event.deltaY === 0) return
      const current = zoomRef.current
      const next = Math.min(1.5, Math.max(0.5, Number((current + (event.deltaY < 0 ? 0.1 : -0.1)).toFixed(1))))
      if (next === current) return
      const bounds = viewport.getBoundingClientRect()
      const x = event.clientX - bounds.left
      const y = event.clientY - bounds.top
      const scroll = zoomAnchor.current ?? { left: viewport.scrollLeft, top: viewport.scrollTop }
      zoomAnchor.current = {
        left: Math.max(0, (scroll.left + x) / current * next - x),
        top: Math.max(0, (scroll.top + y) / current * next - y),
      }
      zoomRef.current = next
      setZoom(next)
    }
    viewport.addEventListener('wheel', wheel, { passive: false })
    return () => viewport.removeEventListener('wheel', wheel)
  }, [completeLayout])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !zoomAnchor.current) return
    viewport.scrollLeft = zoomAnchor.current.left
    viewport.scrollTop = zoomAnchor.current.top
    zoomAnchor.current = null
  }, [zoom])

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as Element).closest('button')) return
    event.preventDefault()
    const viewport = event.currentTarget
    viewport.setPointerCapture?.(event.pointerId)
    pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop }
    setPanning(true)
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const active = pan.current
    if (!active || active.pointerId !== event.pointerId) return
    event.currentTarget.scrollLeft = active.left - (event.clientX - active.x)
    event.currentTarget.scrollTop = active.top - (event.clientY - active.y)
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (pan.current?.pointerId !== event.pointerId) return
    pan.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId)
    setPanning(false)
  }

  if (!completeLayout) return <p role="alert" className="p-4 text-xs text-fail-fg">저장 Layout에 일부 Snapshot Node 좌표가 없습니다.</p>
  const width = Math.max(720, ...layout.nodes.map((node) => node.x + NODE_WIDTH + 48))
  const height = Math.max(420, ...layout.nodes.map((node) => node.y + NODE_HEIGHT + 48))
  const states = new Map(snapshot.latestNodeStates.map((node) => [node.nodeId, node]))

  return <div className="m-4 overflow-hidden rounded-md border border-[#343c46] bg-[#20262e]">
    <div className="flex items-center justify-between gap-3 border-b border-[#343c46] px-3 py-2 text-[0.625rem] text-[#cbd5df]">
      <span>휠로 확대·축소 · 빈 공간을 드래그해 이동</span>
      <span aria-label="모니터링 Canvas 확대 비율">{Math.round(zoom * 100)}%</span>
    </div>
    <div ref={viewportRef} className={`h-[36rem] max-h-[70vh] min-h-[20rem] touch-none overflow-auto overscroll-contain ${panning ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
      aria-label="읽기 전용 Node Canvas" data-canvas-zoom={zoom}
      onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={endPan}>
    <div className="min-h-full min-w-full" style={{ width: width * zoom, height: height * zoom }}>
    <div className="relative bg-[#20262e] bg-[radial-gradient(circle,#596472_1px,transparent_1px)] [background-size:20px_20px]"
      data-monitoring-canvas-content style={{ width, height, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
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
        const running = !snapshot.job.domainTerminal && state?.status === 'RUNNING'
        const current = !snapshot.job.domainTerminal
          && (state?.status === 'RUNNING' || state?.status === 'WAITING_APPROVAL')
        const providerTone = !selected ? 'unread'
          : selectedProviderLabel === '연결됨' ? 'connected'
            : selectedProviderLabel === '관측 대기' ? 'pending'
              : selectedProviderLabel === 'DISABLED' ? 'disabled'
                : selectedProviderLabel === '연결 안 됨' || selectedProviderLabel === 'UNAVAILABLE' ? 'error'
                  : 'unread'
        return <button key={node.id} type="button" aria-label={`${node.id} Node`} aria-pressed={selected}
          className="workflow-node-card monitoring-node-card absolute rounded-lg border bg-field p-3 text-left shadow-[0_8px_22px_#070a0e59]"
          data-node-current={current} data-node-running={running} data-node-selected={selected}
          style={{ left: position.x, top: position.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT, borderColor: current ? '#ff4058' : view.line, borderWidth: current ? 3 : 2 }}
          onClick={() => onSelectNode(node.id)}>
          {current && <svg aria-hidden="true" className="monitoring-node-activity" width="100%" height="100%">
            <rect className="monitoring-node-activity__trail" width="100%" height="100%" rx="8" pathLength="100" />
            <rect className="monitoring-node-activity__head" width="100%" height="100%" rx="8" pathLength="100" />
          </svg>}
          {/* The same name the settings canvas shows, so the two screens read alike; the
              id stays underneath because logs and approvals still refer to it. */}
          <span className="block truncate text-[0.75rem] font-semibold">{nodeDisplayName(profile.profileKey, node)}</span>
          <span className="mt-1 block truncate font-mono text-[0.5625rem] text-muted-2">{node.id}</span>
          <span className="monitoring-node-signals mt-2">
            <span className="monitoring-status-chip monitoring-status-chip--node" data-node-status={state?.status ?? 'NOT_STARTED'}>N · {view.label}</span>
            <span className="monitoring-node-signals__secondary">
              <span className="monitoring-status-chip monitoring-status-chip--provider" data-provider-tone={providerTone}>P · {selected ? selectedProviderLabel : '미조회'}</span>
              <span className="monitoring-status-chip monitoring-status-chip--quality" data-quality-status="unconfigured">Q · 미설정</span>
            </span>
          </span>
        </button>
      })}
    </div>
    </div>
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
