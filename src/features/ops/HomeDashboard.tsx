import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { describeFailure } from '../../shared/api/error'
import type { AdminRole } from '../../shared/api/session'
import { Icon, type IconName } from '../../shared/ui/icons'
import { Badge, PageHead, secondaryButton, type Tone } from '../../shared/ui/primitives'
import type { CodingConsoleApiClient } from '../coding/api'
import type { HistoryClient, HistoryEntry } from '../governance/api'
import type { KnowledgeAdminApi } from '../knowledge/admin-api'
import type { KnowledgeTarget, KnowledgeVersion } from '../knowledge/admin-types'
import type { AgentSettingsApiClient, ObservabilityMetricRow } from '../orchestration/api'
import { monitoringJobHref } from '../orchestration/ActiveJobMonitoringLink'
import './HomeDashboard.css'

type DashboardProps = {
  actorName: string
  role: AdminRole
  historyApi: HistoryClient
  knowledgeApi: Pick<KnowledgeAdminApi, 'resolveTarget' | 'listVersions'>
  profileApi: Pick<AgentSettingsApiClient, 'getObservabilityMetrics' | 'listMonitoringJobs'>
  codingApi: Pick<CodingConsoleApiClient, 'runnerStatus'>
}
type Query<T> = { data: T | null; loading: boolean; error: string | null }

// Each panel fails independently. A replaced/unmounted request cannot restore old data.
function useDashboardQuery<T>(read: ((signal: AbortSignal) => Promise<T>) | null, revision: number): Query<T> {
  const [result, setResult] = useState<Query<T>>({ data: null, loading: !!read, error: null })
  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setResult({ data: null, loading: !!read, error: null })
    if (read) void Promise.resolve().then(() => read(controller.signal)).then(
      (data) => { if (current) setResult({ data, loading: false, error: null }) },
      (error: unknown) => { if (current) setResult({ data: null, loading: false, error: describeFailure(error) }) },
    )
    return () => { current = false; controller.abort() }
  }, [read, revision])
  return result
}

const domains: Record<string, { label: string; color: string }> = {
  RAG: { label: 'RAG', color: '#4c9ddd' },
  LLM_OPS: { label: 'LLM DevOps', color: '#45b9ac' },
  NATURAL_CMS: { label: '자연어 CMS', color: '#a28ad9' },
}
const states: Record<string, { label: string; tone: Tone }> = {
  WAITING_APPROVAL: { label: '승인 대기', tone: 'wait' }, APPROVAL_PENDING: { label: '승인 대기', tone: 'wait' },
  RUNNING: { label: '실행 중', tone: 'run' }, BUILDING: { label: '빌드 중', tone: 'run' },
  BUILD_REQUESTED: { label: '빌드 대기', tone: 'idle' }, PENDING: { label: '대기', tone: 'idle' }, QUEUED: { label: '대기', tone: 'idle' },
  COMPLETED: { label: '종료', tone: 'idle' }, SUCCEEDED: { label: '성공', tone: 'ok' },
  FAILED: { label: '실패', tone: 'fail' }, CANCELLED: { label: '취소', tone: 'idle' }, CANCELED: { label: '취소', tone: 'idle' },
  EXPIRED: { label: '만료', tone: 'idle' }, ACTIVE: { label: '활성', tone: 'ok' }, ARCHIVED: { label: '보관', tone: 'idle' },
}
function StateBadge({ value }: { value: string }) {
  const state = states[value] ?? { label: value, tone: 'idle' as const }
  return <Badge tone={state.tone}>{state.label}</Badge>
}
const numeric = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const count = (value: number | null | undefined) => numeric(value) ? value.toLocaleString('ko-KR') : '미수집'
const time = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '시각 미확인'

function Panel({ title, label, action, children, className = '' }: { title: string; label: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`dashboard-panel ${className}`} aria-label={title}>
    <div className="dashboard-panel-head"><div><span className="dashboard-eyebrow">{label}</span><h2>{title}</h2></div>{action}</div>
    {children}
  </section>
}
function QueryMessage({ query, empty, children }: { query: Query<unknown>; empty?: boolean; children: ReactNode }) {
  if (query.loading) return <p className="dashboard-message" role="status">데이터를 불러오는 중입니다…</p>
  if (query.error) return <p className="dashboard-message dashboard-error" role="alert">조회하지 못했습니다. {query.error}</p>
  if (empty) return <p className="dashboard-message">아직 표시할 기록이 없습니다.</p>
  return <>{children}</>
}
function MetricCard({ label, value, detail, icon, tone = 'blue' }: { label: string; value: ReactNode; detail: string; icon: IconName; tone?: string }) {
  return <div className={`dashboard-stat dashboard-stat-${tone}`}><div className="dashboard-stat-top"><span>{label}</span><Icon name={icon} size={18} /></div><b>{value}</b><small>{detail}</small></div>
}

export default function HomeDashboard({ actorName, role, historyApi, knowledgeApi, profileApi, codingApi }: DashboardProps) {
  const [revision, setRevision] = useState(0)
  const superAdmin = role === 'SUPER_ADMIN'
  const readRuns = useCallback((signal: AbortSignal) => historyApi.runs('AI', { signal }), [historyApi])
  const runs = useDashboardQuery(readRuns, revision)
  const readMonitoring = useCallback((signal: AbortSignal) => profileApi.listMonitoringJobs(signal), [profileApi])
  const monitoring = useDashboardQuery(superAdmin ? readMonitoring : null, revision)
  const readRunner = useCallback(() => codingApi.runnerStatus(), [codingApi])
  const runner = useDashboardQuery(readRunner, revision)
  const recent = runs.data?.items ?? []
  const waiting = recent.filter((entry) => entry.status === 'WAITING_APPROVAL')
  const observed = monitoring.data?.jobs ?? []
  const ongoing = observed.filter((job) => !job.domainTerminal)

  return <div className="home-dashboard">
    <PageHead title="운영 대시보드" description={`${actorName}님, AI 요청부터 지식 인덱스와 모델 사용량까지 한눈에 확인하세요.`} wrapActions>
      <button type="button" className={secondaryButton} onClick={() => setRevision((value) => value + 1)}><Icon name="repeat" />새로고침</button>
    </PageHead>
    <div className="dashboard-stats">
      <MetricCard label="최근 AI 요청" value={runs.data ? `${recent.length}건` : '—'} detail={runs.data ? '최근 생성 순 · 최대 25건 조회' : runs.error ? '조회 실패' : '조회 중'} icon="sparkles" />
      <MetricCard label="최근 요청 중 승인 대기" value={runs.data ? `${waiting.length}건` : '—'} detail="위 최근 요청 범위 · 전체 대기 수 아님" icon="shield-check" tone="amber" />
      {superAdmin && <MetricCard label="관측된 미종료 작업" value={monitoring.data ? `${ongoing.length}건` : '—'} detail={monitoring.error ? '관측 조회 실패' : '관측 목록 최대 50건 중 · 승인 대기 포함'} icon="activity" tone="teal" />}
      <MetricCard label="Coding Runner" value={runner.data ? runner.data.alive ? '응답 있음' : '응답 없음' : '—'} detail={runner.data ? `마지막 보고 ${time(runner.data.lastSeenAt)}` : runner.error ? '상태 조회 실패' : '상태 조회 중'} icon="network" tone="purple" />
    </div>

    <div className="dashboard-main-grid">
      {superAdmin && <ModelUsage api={profileApi} revision={revision} />}
      <Panel title="최근 요청 구성" label="AI 02 · 04 · 05" action={<Link to="/admin/runs" className="dashboard-link">이력 보기 <span aria-hidden="true">↗</span></Link>} className={superAdmin ? '' : 'dashboard-wide'}>
        <QueryMessage query={runs} empty={!!runs.data && recent.length === 0}>
          {runs.data && <RequestDonut entries={recent} />}
          <p className="dashboard-footnote">최근 생성된 {recent.length}건 내 기능별 비중{runs.data?.nextCursor ? ' · 이전 요청 더 있음' : ''}<br />전체 누적·기간별 통계가 아닙니다.</p>
        </QueryMessage>
      </Panel>
    </div>

    <div className="dashboard-main-grid">
      <Panel title="최근 AI 요청" label="요청 → 실행 → 승인" action={<Link to="/admin/runs" className="dashboard-link">전체 이력 ↗</Link>}>
        <QueryMessage query={runs} empty={!!runs.data && recent.length === 0}>
          <div className="dashboard-request-list">{recent.slice(0, 6).map((entry) => <RequestRow key={entry.id} entry={entry} />)}</div>
          {runs.data && <p className="dashboard-footnote">조회 {time(runs.data.observedAt)} · 생성 순 · ‘종료’가 요구사항 달성을 뜻하지는 않습니다.</p>}
        </QueryMessage>
      </Panel>
      <RagSummary api={knowledgeApi} revision={revision} />
    </div>

    <div className="dashboard-main-grid">
      <Panel title="승인 확인이 필요한 최근 요청" label="검토할 작업" action={<Link to="/admin/approvals" className="dashboard-link">승인 이력 ↗</Link>}>
        <QueryMessage query={runs}>
          {runs.data && (waiting.length ? <div className="dashboard-request-list">{waiting.slice(0, 4).map((entry) => <RequestRow key={entry.id} entry={entry} />)}</div>
            : <p className="dashboard-message">조회한 최근 요청에는 승인 대기가 없습니다.</p>)}
          <p className="dashboard-footnote">최근 최대 25건의 현재 상태 기준입니다. 승인·반려는 해당 기능 화면에서 확인하세요.</p>
        </QueryMessage>
      </Panel>
      {superAdmin ? <Panel title="실행 관측" label="AI 06 · 오케스트레이션" action={<Link to="/admin/models?tab=monitoring" className="dashboard-link">모니터링 ↗</Link>}>
        <QueryMessage query={monitoring} empty={!!monitoring.data && !observed.length}>
          <div className="dashboard-monitor-list">{observed.slice(0, 4).map((job) => <Link key={job.jobId} to={monitoringJobHref(job.jobId)} className="dashboard-monitor-row">
            <span className="dashboard-node-dot" aria-hidden="true" /><span><b>{domains[job.profileKey]?.label ?? job.profileKey} <small>v{job.profileVersion}</small></b><small>{job.currentNode?.nodeId ?? '현재 노드 미보고'} · {time(job.lastUpdatedAt)}</small></span><StateBadge value={job.domainJobStatus} />
          </Link>)}</div>
          <p className="dashboard-footnote">보고된 작업 최대 50건 · 미보고 작업과 RAG 빌드는 포함되지 않습니다.</p>
        </QueryMessage>
      </Panel> : <Panel title="AI 운영 바로가기" label="관리자 작업"><div className="dashboard-shortcuts"><Link to="/admin/rag">RAG 관리 ↗</Link><Link to="/admin/llm-devops">LLM DevOps ↗</Link><Link to="/admin/contents">CMS 콘텐츠 ↗</Link></div></Panel>}
    </div>
    <div className="dashboard-quality-note"><Icon name="search-check" size={20} /><div><b>RAG 품질 · 평가 대상과 날짜를 함께 확인하세요</b><p>현재 품질 화면은 오프라인 평가 결과를 제공합니다. 활성 인덱스의 실시간 품질 점수와 추세는 아직 연결되지 않았습니다.</p></div><Link to="/admin/rag" className="dashboard-link">품질 확인 ↗</Link></div>
  </div>
}

function RequestRow({ entry }: { entry: HistoryEntry }) {
  const href = entry.domain === 'RAG' ? '/admin/rag' : entry.domain === 'LLM_OPS' ? '/admin/llm-devops' : '/admin/runs'
  return <div className="dashboard-request-row"><span className="dashboard-domain-dot" style={{ background: domains[entry.domain]?.color ?? '#8796a5' }} aria-hidden="true" /><div><Link to={href} title={entry.title}>{entry.title}</Link><small>{domains[entry.domain]?.label ?? entry.domain} · {time(entry.createdAt)}{entry.errorCode ? ` · ${entry.errorCode}` : ''}</small></div><StateBadge value={entry.status} /></div>
}

function RequestDonut({ entries }: { entries: HistoryEntry[] }) {
  const groups = new Map<string, number>()
  entries.forEach((entry) => groups.set(entry.domain, (groups.get(entry.domain) ?? 0) + 1))
  let offset = 0
  return <div className="dashboard-donut-layout"><div className="dashboard-donut-wrap">
    <svg viewBox="0 0 160 160" role="img" aria-label={`최근 요청 ${entries.length}건의 기능별 구성`}>
      <circle cx="80" cy="80" r="62" fill="none" stroke="var(--line-soft)" strokeWidth="17" />
      {[...groups].map(([domain, n]) => {
        const percentage = n / entries.length * 100
        const start = offset; offset += percentage
        return <circle key={domain} cx="80" cy="80" r="62" pathLength="100" fill="none" stroke={domains[domain]?.color ?? '#8796a5'} strokeWidth="17" strokeDasharray={`${percentage} ${100 - percentage}`} strokeDashoffset={-start} transform="rotate(-90 80 80)"><title>{domains[domain]?.label ?? domain}: {n}건 ({percentage.toFixed(1)}%)</title></circle>
      })}
    </svg><div className="dashboard-donut-center"><b>{entries.length}</b><span>최근 요청</span></div>
    </div><ul className="dashboard-legend">{[...groups].map(([domain, n]) => <li key={domain}><i style={{ background: domains[domain]?.color ?? '#8796a5' }} /><span>{domains[domain]?.label ?? domain}</span><b>{n}건</b><small>{(n / entries.length * 100).toFixed(1)}%</small></li>)}</ul>
  </div>
}

type Metric = 'observationCount' | 'totalTokens' | 'totalCost'
const metrics: { key: Metric; label: string; unit: string }[] = [{ key: 'observationCount', label: '호출', unit: '회' }, { key: 'totalTokens', label: '토큰', unit: 'tokens' }, { key: 'totalCost', label: '비용', unit: 'USD' }]
function metricText(value: number | null, metric: Metric) {
  if (!numeric(value)) return '미수집'
  return metric === 'totalCost' ? value > 0 && value < 0.000001 ? '<$0.000001' : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : count(value)
}
function ModelUsage({ api, revision }: { api: DashboardProps['profileApi']; revision: number }) {
  const [days, setDays] = useState(1)
  const [metric, setMetric] = useState<Metric>('observationCount')
  const read = useCallback((signal: AbortSignal) => {
    const to = new Date()
    return api.getObservabilityMetrics(new Date(to.getTime() - days * 86_400_000).toISOString(), to.toISOString(), undefined, signal)
  }, [api, days])
  const query = useDashboardQuery(read, revision)
  const data = query.data
  const rows = data?.status === 'AVAILABLE' ? data.rows : []
  const sorted = [...rows].sort((a, b) => (numeric(b[metric]) ? b[metric] : -1) - (numeric(a[metric]) ? a[metric] : -1)).slice(0, 6)
  const maximum = Math.max(0, ...sorted.map((row) => numeric(row[metric]) ? row[metric] : 0))
  return <Panel title="모델별 사용량" label="AI 06 · PROVIDER 계측" action={<select aria-label="모델 사용량 기간" value={days} onChange={(event) => setDays(Number(event.target.value))} className="dashboard-select"><option value={1}>최근 24시간</option><option value={7}>최근 7일</option></select>}>
    <div className="dashboard-chart-toolbar"><div className="dashboard-segment" aria-label="모델 사용량 지표">{metrics.map((item) => <button key={item.key} type="button" aria-pressed={metric === item.key} onClick={() => setMetric(item.key)}>{item.label}</button>)}</div><small>모델별 {metrics.find((item) => item.key === metric)?.unit} · 상위 6개</small></div>
    <QueryMessage query={query}>
      {data?.status === 'DISABLED' && <p className="dashboard-message">모델 계측이 연결되지 않았습니다.</p>}
      {data?.status === 'UNAVAILABLE' && <p className="dashboard-message dashboard-error" role="alert">모델 계측을 조회할 수 없습니다. {data.errorCode}</p>}
      {data?.status === 'AVAILABLE' && (!rows.length ? <p className="dashboard-message">선택 기간에 관측된 모델 호출이 없습니다.</p> : <div className="dashboard-bars" role="group" aria-label={`모델별 ${metrics.find((item) => item.key === metric)?.label} 비교`}>
        {sorted.map((row, index) => <div className="dashboard-bar-row" key={`${row.model}-${index}`}><div><span title={row.model ?? undefined}>{row.model ?? '모델 미확인'}</span><b>{metricText(row[metric], metric)}</b></div><div className="dashboard-bar-track" aria-hidden="true"><i style={{ width: `${numeric(row[metric]) && maximum > 0 ? row[metric] / maximum * 100 : 0}%`, background: ['#4c9ddd', '#45b9ac', '#a28ad9', '#d6a456', '#6586d0', '#ca839c'][index] }} /></div></div>)}
      </div>)}
      {data && <p className="dashboard-footnote">{time(data.from)} – {time(data.to)} · {data.environment}<br />같은 기간의 계측값 · 최대 50개 모델 조회 · 미수집은 0으로 처리하지 않습니다.</p>}
      {data?.status === 'AVAILABLE' && rows.length > 0 && <LatencyTable rows={sorted} />}
    </QueryMessage>
  </Panel>
}

function LatencyTable({ rows }: { rows: ObservabilityMetricRow[] }) {
  return <details className="dashboard-latency"><summary>같은 모델의 응답 지연 보기</summary><div className="dashboard-table-scroll"><table><caption className="sr-only">모델별 P50 및 P95 응답 지연</caption><thead><tr><th>모델</th><th>P50</th><th>P95</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.model}-${index}`}><td>{row.model ?? '모델 미확인'}</td><td>{numeric(row.p50LatencyMs) ? `${(row.p50LatencyMs / 1000).toFixed(2)}s` : '미수집'}</td><td>{numeric(row.p95LatencyMs) ? `${(row.p95LatencyMs / 1000).toFixed(2)}s` : '미수집'}</td></tr>)}</tbody></table></div></details>
}

function RagSummary({ api, revision }: { api: DashboardProps['knowledgeApi']; revision: number }) {
  const [projectId, setProjectId] = useState('')
  const [knowledgeBaseId, setKnowledgeBaseId] = useState('')
  const read = useCallback(async () => {
    const target = await api.resolveTarget({ projectId: projectId || undefined, knowledgeBaseId: knowledgeBaseId || undefined })
    const versions = target.kind === 'ready' ? (await api.listVersions(target.knowledgeBaseId)).items : []
    return { target, versions }
  }, [api, projectId, knowledgeBaseId])
  const query = useDashboardQuery(read, revision)
  const target = query.data?.target
  const versions = query.data?.versions ?? []
  const base = target?.kind === 'ready' ? target.bases.find((candidate) => candidate.knowledgeBaseId === target.knowledgeBaseId) : undefined
  const active = base?.activeVersionId ? versions.find((version) => version.knowledgeVersionId === base.activeVersionId) : undefined
  const href = target?.kind === 'ready' ? `/admin/rag?projectId=${encodeURIComponent(target.projectId)}&knowledgeBaseId=${encodeURIComponent(target.knowledgeBaseId)}` : '/admin/rag'
  return <Panel title="지식 인덱스" label="AI 02 · 도메인 RAG" action={<Link to={href} className="dashboard-link">RAG 관리 ↗</Link>}>
    <QueryMessage query={query}>
      {target && <RagSelectors target={target} projectId={projectId} knowledgeBaseId={knowledgeBaseId} chooseProject={(id) => { setProjectId(id); setKnowledgeBaseId('') }} chooseBase={setKnowledgeBaseId} />}
      {target?.kind === 'choose' && <p className="dashboard-message">{target.what === 'project' ? '프로젝트' : '지식베이스'}를 선택하면 활성 인덱스를 확인할 수 있습니다.</p>}
      {target?.kind === 'empty' && <p className="dashboard-message">등록된 {target.what === 'project' ? '프로젝트' : '지식베이스'}가 없습니다.</p>}
      {target?.kind === 'ready' && <>
        <div className="dashboard-rag-active"><span className="dashboard-rag-icon"><Icon name="database" size={24} /></span><div><small>{target.name}</small><b>{active ? `활성 v${active.versionNumber}` : base?.activeVersionId ? '활성 버전 상세 미확인' : '활성 버전 없음'}</b></div>{active && <StateBadge value={active.status} />}</div>
        <div className="dashboard-rag-counts"><div><small>문서</small><b>{active ? count(active.documentCount) : '—'}</b></div><div><small>청크</small><b>{active ? count(active.chunkCount) : '—'}</b></div></div>
        <p className="dashboard-footnote">마지막 활성화 {time(active?.activatedAt)}</p>
        <RagBuilds versions={versions} />
      </>}
    </QueryMessage>
  </Panel>
}
function RagSelectors({ target, projectId, knowledgeBaseId, chooseProject, chooseBase }: { target: KnowledgeTarget; projectId: string; knowledgeBaseId: string; chooseProject: (id: string) => void; chooseBase: (id: string) => void }) {
  const projects = target.projects ?? []
  const bases = 'bases' in target ? target.bases ?? [] : []
  return <div className="dashboard-rag-selectors">
    {projects.length > 0 && <select aria-label="대시보드 RAG 프로젝트" className="dashboard-select" value={target.project?.projectId ?? projectId} onChange={(event) => chooseProject(event.target.value)}><option value="">프로젝트 선택</option>{projects.map((project) => <option key={project.projectId} value={project.projectId}>{project.name}</option>)}</select>}
    {bases.length > 0 && <select aria-label="대시보드 지식베이스" className="dashboard-select" value={target.kind === 'ready' ? target.knowledgeBaseId : knowledgeBaseId} onChange={(event) => chooseBase(event.target.value)}><option value="">지식베이스 선택</option>{bases.map((base) => <option key={base.knowledgeBaseId} value={base.knowledgeBaseId}>{base.name}</option>)}</select>}
  </div>
}
function RagBuilds({ versions }: { versions: KnowledgeVersion[] }) {
  const builds = versions.filter((version) => ['BUILD_REQUESTED', 'BUILDING', 'APPROVAL_PENDING', 'FAILED'].includes(version.status)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 2)
  return <div className="dashboard-rag-builds">{builds.map((version) => <div key={version.knowledgeVersionId}><span>v{version.versionNumber} <small>{time(version.createdAt)}</small></span><StateBadge value={version.status} /></div>)}</div>
}
