import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { describeFailure } from '../../shared/api/error'
import type { AdminRole } from '../../shared/api/session'
import { Badge, Callout, PageHead, PanelTitle, panel, primaryButton, secondaryButton, smallButton, type Tone } from '../../shared/ui/primitives'
import { KnowledgeAdminApi } from './admin-api'
import type { KnowledgeBase, KnowledgeTarget, KnowledgeVersion, KnowledgeVersionStatus, AgentJob, Project } from './admin-types'
import { buildView, findInProgress, formatElapsed, BUILD_STEPS, stepStates, type BuildView } from './build-progress'

/**
 * `/admin/rag` 실배선(C). 목업이던 `OpsWorkspace.Rag()`를 대체한다.
 *
 * <p>UI가 `features/ops`에 있었으나 AGENTS.md가 지정한 자리는 `features/knowledge`다.
 * 실연동 코드를 `ops`에 쌓으면 경계를 되돌리기 어려워 여기에 둔다. `ops`의 나머지 화면
 * 이동은 별도 작업이다.
 *
 * <p>**범위 밖**: 알림 패널(폐기) · 질의 콘솔 A1(폐기 — 실동작 챗봇은 포털에만) ·
 * 데이터 소스 추가(커넥터).
 */

const POLL_INTERVAL_MS = 5_000
/**
 * 경과 시간 시계. **폴링과 분리한다.**
 *
 * <p>원래는 `setNowMs`가 폴링 `tick()` 안에만 있었다. 그래서 폴링이 멈추면 경과 시간이
 * 얼어붙고, **얼어붙은 것을 알려 줄 12분 정체 경고도 같이 얼어붙었다** — 정체를 감지하려고
 * 만든 장치가 정체의 가장 흔한 원인(폴링 중단)에 작동하지 않았다.
 *
 * <p>9/7 실측: 빌드가 끝났는데 화면이 「진행 중 · 8분 33초」로 남았다. 브라우저가 백그라운드
 * 탭을 얼린 것으로 보이며, 그 상태에서 경과도 경고도 멈춰 있었다.
 */
const CLOCK_INTERVAL_MS = 1_000

/** 쓰기 4종은 전부 SUPER_ADMIN 전용이다(`SecurityConfig:127-134`). */
const WRITE_DENIED = 'SUPER_ADMIN 권한이 필요합니다. 최고 관리자에게 요청하세요.'

const STATUS_TONE: Record<KnowledgeVersionStatus, Tone> = {
  BUILD_REQUESTED: 'run', BUILDING: 'run', APPROVAL_PENDING: 'wait',
  ACTIVE: 'ok', ARCHIVED: 'idle', FAILED: 'fail',
}

const STATUS_LABEL: Record<KnowledgeVersionStatus, string> = {
  BUILD_REQUESTED: '빌드 요청됨', BUILDING: '빌드 중', APPROVAL_PENDING: '승인 대기',
  ACTIVE: '활성', ARCHIVED: '보관', FAILED: '실패',
}

/**
 * 전환 경로는 상태마다 다르다 — **같은 버튼이 다른 엔드포인트를 부른다.**
 *
 * <p>`activate`는 `APPROVAL_PENDING`·`ACTIVE`에서만 허용되므로 보관된 버전에 부르면
 * 409 `KNOWLEDGE_VERSION_NOT_APPROVABLE`이 난다(9/7 실호출로 확인). 보관 버전으로
 * 되돌아가는 것은 rollback 전용 엔드포인트의 일이다.
 *
 * <p>`FAILED`는 어느 쪽도 받지 않는다. 게다가 실패 버전은 문서 0건이라 활성화되면
 * 챗봇이 통째로 빈 지식을 보게 된다(함정 2).
 */
function switchPath(status: KnowledgeVersionStatus): 'activate' | 'rollback' | null {
  if (status === 'APPROVAL_PENDING') return 'activate'
  if (status === 'ARCHIVED') return 'rollback'
  return null
}

const NOT_SWITCHABLE: Partial<Record<KnowledgeVersionStatus, string>> = {
  FAILED: '실패한 빌드는 활성화할 수 없습니다.',
  BUILDING: '빌드가 끝나야 활성화할 수 있습니다.',
  BUILD_REQUESTED: '빌드가 끝나야 활성화할 수 있습니다.',
}

/**
 * 기본으로 보이는 버전 — **활성 · 승인 대기 · 최신 2건**의 합집합.
 *
 * <p>버전은 지우지 않는다. 실패한 빌드까지 남아 있는 것이 "버전은 고치지 않고 새로
 * 만든다"의 증거다. 다만 11건이 한 번에 깔리면 지금 무엇을 봐야 하는지가 묻힌다 —
 * 지우는 대신 접는다.
 *
 * <p>"최신 N건"만으로는 부족하다. 활성 버전이 목록 중간에 있을 수 있어서(롤백하면 그렇게
 * 된다) 최신순으로 자르면 정작 지금 쓰는 버전이 사라진다.
 */
const ALWAYS_VISIBLE_RECENT = 2

function visibleVersions(versions: KnowledgeVersion[]): KnowledgeVersion[] {
  const keep = new Set<string>()
  versions.slice(0, ALWAYS_VISIBLE_RECENT).forEach((v) => keep.add(v.knowledgeVersionId))
  versions
    .filter((v) => v.status === 'ACTIVE' || v.status === 'APPROVAL_PENDING')
    .forEach((v) => keep.add(v.knowledgeVersionId))
  return versions.filter((v) => keep.has(v.knowledgeVersionId))
}

/** 확인 창 하나로 쓰기 3종을 받는다. 되돌리기 어려운 동작 앞에 사람 손을 한 번 더 둔다. */
type Confirmation = { title: string; lines: string[]; label: string; run: () => Promise<unknown> }

export function RagAdminPanel({ api, role }: { api: KnowledgeAdminApi; role: AdminRole }) {
  const [target, setTarget] = useState<KnowledgeTarget | null>(null)
  const [versions, setVersions] = useState<KnowledgeVersion[] | null>(null)
  const [job, setJob] = useState<AgentJob | null>(null)
  const [failure, setFailure] = useState<unknown>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  // 선택은 URL에 둔다. 새로고침·링크 공유가 그대로 되고 전역 상태가 필요 없다.
  const [params, setParams] = useSearchParams()
  const chosenProjectId = params.get('projectId') ?? undefined
  const chosenKnowledgeBaseId = params.get('knowledgeBaseId') ?? undefined

  const mayWrite = role === 'SUPER_ADMIN'

  // 마운트마다 되살린다. StrictMode는 개발에서 mount → unmount → mount로 두 번 도는데,
  // 정리에서 false로만 두면 두 번째 마운트에서 영원히 false로 남아 모든 setState가 막힌다.
  // 실제로 이 버그로 화면이 "조회 중…"에서 멈춰 있었다(9/6).
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const loadVersions = useCallback(async (knowledgeBaseId: string) => {
    const list = await api.listVersions(knowledgeBaseId)
    if (alive.current) setVersions(list.items ?? [])
    return list.items ?? []
  }, [api])

  // 진입 시 프로젝트 → 지식 베이스 → 버전 순으로 1회씩. UUID를 상수로 박지 않는다.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const resolved = await api.resolveTarget({ projectId: chosenProjectId, knowledgeBaseId: chosenKnowledgeBaseId })
        if (cancelled || !alive.current) return
        setTarget(resolved)
        if (resolved.kind === 'ready') await loadVersions(resolved.knowledgeBaseId)
      }
      catch (error) {
        if (!cancelled && alive.current) setFailure(error)
      }
    })()
    return () => { cancelled = true }
  }, [api, loadVersions, chosenProjectId, chosenKnowledgeBaseId])

  const inProgress = versions ? findInProgress(versions) : null

  // 시계는 네트워크와 무관하게 돈다. API가 다 죽어도 경과 시간은 올라가야
  // "멈췄다"를 사람이 알아볼 수 있다.
  useEffect(() => {
    if (!inProgress) return
    const timer = setInterval(() => setNowMs(Date.now()), CLOCK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [inProgress])

  // 폴링은 진행 중일 때만 돈다(설계 §5). 진행 중 감지는 진입 시 versions 1회 조회가
  // 겸하므로 추가 호출이 없고, 8분 빌드 도중 새로고침이 나도 패널이 복구된다.
  useEffect(() => {
    if (!inProgress || target?.kind !== 'ready') return
    const knowledgeBaseId = target.knowledgeBaseId
    const jobId = inProgress.buildJobId
    const tick = async () => {
      setNowMs(Date.now())
      try {
        if (jobId) {
          const next = await api.getJob(jobId)
          if (alive.current) setJob(next)
        }
        await loadVersions(knowledgeBaseId)
      }
      catch (error) {
        if (alive.current) setFailure(error)
      }
    }
    void tick()
    const timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
    // 브라우저는 백그라운드 탭의 인터벌을 늦추거나 아예 얼린다. 돌아온 순간 한 번
    // 따라잡지 않으면 최대 5초를 더 옛 화면으로 보낸다 — 촬영에서는 그 사이가 컷이 된다.
    const catchUp = () => { if (!document.hidden) { setNowMs(Date.now()); void tick() } }
    document.addEventListener('visibilitychange', catchUp)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', catchUp)
    }
  }, [api, inProgress, target, loadVersions])

  const active = versions?.find((version) => version.status === 'ACTIVE') ?? null
  const view = inProgress ? buildView(inProgress, job, nowMs) : null

  // 프로젝트를 바꾸면 하위 선택은 버린다 — 다른 프로젝트의 지식 베이스 id가 남으면
  // 목록에 없어 무시되고, 남아 있는 것만으로 헷갈린다.
  const pickTarget = useCallback((what: 'project' | 'knowledgeBase', id: string) => {
    const next = new URLSearchParams(params)
    if (what === 'project') {
      next.set('projectId', id)
      next.delete('knowledgeBaseId')
    }
    else next.set('knowledgeBaseId', id)
    setParams(next, { replace: true })
  }, [params, setParams])

  const knowledgeBaseId = target?.kind === 'ready' ? target.knowledgeBaseId : null
  const newest = versions?.[0] ?? null
  /** 이전 활성 버전 = 마지막으로 활성화된 적 있는 보관 버전. 없으면 롤백 대상이 없다. */
  const previousActive = (versions ?? [])
    .filter((v) => v.status === 'ARCHIVED' && v.activatedAt)
    .sort((a, b) => (a.activatedAt! < b.activatedAt! ? 1 : -1))[0] ?? null

  /** 확인 창에서 승인했을 때만 실행한다. 성공하든 실패하든 목록을 다시 읽어 화면을 실제 상태에 맞춘다. */
  const runConfirmed = useCallback(async () => {
    if (!confirmation || !knowledgeBaseId) return
    setBusy(true)
    try {
      await confirmation.run()
      if (alive.current) setFailure(null)
    }
    catch (error) {
      if (alive.current) setFailure(error)
    }
    finally {
      try { await loadVersions(knowledgeBaseId) } catch { /* 위 실패 표시를 덮지 않는다 */ }
      if (alive.current) { setBusy(false); setConfirmation(null) }
    }
  }, [confirmation, knowledgeBaseId, loadVersions])

  const askSwitch = useCallback((version: KnowledgeVersion) => {
    if (!knowledgeBaseId) return
    const path = switchPath(version.status)
    if (!path) return
    setConfirmation({
      title: path === 'activate' ? `v${version.versionNumber} 활성화 (승인)` : `v${version.versionNumber}로 되돌리기`,
      lines: [
        `활성화하면 포털 검색·챗봇이 즉시 v${version.versionNumber} 기준으로 답합니다.`,
        // 함정 2 — 빈 버전도 조용히 ACTIVE가 된다. 누르기 전에 건수를 눈으로 확인시킨다.
        `문서 ${version.documentCount} · 청크 ${version.chunkCount}`,
        '현재 활성 버전은 보관됨으로 남고 다시 되돌릴 수 있습니다.',
      ],
      label: path === 'activate' ? '활성화 (승인)' : '되돌리기',
      run: () => path === 'activate'
        ? api.activate(version.knowledgeVersionId)
        : api.rollback(knowledgeBaseId, version.knowledgeVersionId),
    })
  }, [api, knowledgeBaseId])

  const askRollback = useCallback(() => {
    if (!knowledgeBaseId || !previousActive) return
    setConfirmation({
      title: `이전 활성 버전(v${previousActive.versionNumber})으로 롤백`,
      lines: [
        `현재 활성 ${active ? `v${active.versionNumber}` : '버전'} → v${previousActive.versionNumber}로 되돌립니다.`,
        `문서 ${previousActive.documentCount} · 청크 ${previousActive.chunkCount}`,
        '포털 답변이 즉시 바뀝니다. 되돌린 버전은 보관됨으로 남습니다.',
      ],
      label: '롤백',
      run: () => api.rollback(knowledgeBaseId, previousActive.knowledgeVersionId),
    })
  }, [api, knowledgeBaseId, previousActive, active])

  const askBuild = useCallback(() => {
    // 커넥터를 따로 고르지 않는다 — 최신 버전이 쓴 것을 그대로 재사용한다(같은 자료원 재수집).
    if (!knowledgeBaseId || !newest) return
    setConfirmation({
      title: '새 지식 버전 빌드',
      lines: [
        '수집 → 청크 → 임베딩까지 도는 작업입니다. 실측 8분대가 걸립니다.',
        '완료돼도 자동 활성화되지 않고 승인 대기 상태로 멈춥니다.',
        '진행 중에는 이 화면에서 경과 시간을 볼 수 있습니다.',
      ],
      label: '빌드 시작',
      run: () => api.startBuild(knowledgeBaseId, newest.connectorVersionId, `admin build ${new Date().toISOString().slice(0, 10)}`),
    })
  }, [api, knowledgeBaseId, newest])

  const canWrite = mayWrite && knowledgeBaseId != null

  return <>
    <PageHead title="RAG 관리" description="관광 공공데이터를 검색자료로 만들고 버전별 품질을 비교합니다.">
      <button className={secondaryButton} disabled title="커넥터 관리는 이번 범위 밖입니다.">데이터 소스 추가</button>
      <button
        className={primaryButton}
        disabled={!canWrite || busy || newest == null || view != null}
        onClick={askBuild}
        title={!mayWrite ? WRITE_DENIED : view != null ? '이미 빌드가 진행 중입니다.' : '새 지식 버전을 만듭니다 (8분대).'}
      >Build 시작</button>
    </PageHead>

    {!mayWrite && <Callout tone="warn" icon="lock">조회만 가능합니다. {WRITE_DENIED}</Callout>}
    {failure != null && <Callout tone="warn" icon="triangle-alert">{describeFailure(failure)}</Callout>}
    {target?.kind === 'empty' && <TargetNotice target={target} />}
    {target != null && target.kind !== 'empty' && <TargetPicker target={target} onPick={pickTarget} />}

    <div className="flex min-w-0 flex-col gap-[0.875rem]">
      {/* 대상이 정해지지 않으면 요약·버전 표는 영원히 "조회 중"에 머문다. 기다리는 것처럼
          보이면 사용자가 원인을 위쪽 안내가 아니라 네트워크에서 찾게 된다. */}
      <Summary
        active={active}
        name={target?.kind === 'ready' ? target.name : null}
        loading={target == null && failure == null}
        blocked={target != null && target.kind !== 'ready'}
      />
      {view && <BuildProgress view={view} />}
      <QualityMetrics />
      <VersionTable
        versions={versions}
        mayWrite={mayWrite}
        blocked={target != null && target.kind !== 'ready'}
        busy={busy || !canWrite}
        canRollback={canWrite && previousActive != null}
        onSwitch={askSwitch}
        onRollback={askRollback}
      />
    </div>
    {confirmation && <ConfirmDialog
      confirmation={confirmation}
      busy={busy}
      onCancel={() => { if (!busy) setConfirmation(null) }}
      onConfirm={() => { void runConfirmed() }}
    />}
  </>
}

/**
 * 되돌리기 어려운 쓰기 3종 앞의 확인 창.
 *
 * <p>건수(문서·청크)를 본문에 넣는 것이 핵심이다 — 빈 버전도 오류 없이 활성화되므로
 * (함정 2) 누르기 전에 사람이 눈으로 볼 마지막 지점이 여기다.
 */
function ConfirmDialog({ confirmation, busy, onCancel, onConfirm }: {
  confirmation: Confirmation
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    role="dialog"
    aria-modal="true"
    aria-label={confirmation.title}
  >
    <div className={`${panel} w-full max-w-[26rem]`}>
      <div className="px-4 py-3">
        <h2 className="text-[0.875rem] font-semibold text-ink">{confirmation.title}</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {confirmation.lines.map((line) => <li key={line} className="text-[0.75rem] text-muted-2">{line}</li>)}
        </ul>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
        <button className={secondaryButton} onClick={onCancel} disabled={busy}>취소</button>
        <button className={primaryButton} onClick={onConfirm} disabled={busy}>
          {busy ? '처리 중…' : confirmation.label}
        </button>
      </div>
    </div>
  </div>
}

/**
 * 0건·여러 건을 **추측으로 넘기지 않는다.** 여러 건일 때 첫 번째를 조용히 고르면
 * 잘못된 지식 베이스를 보고도 모른다.
 */
function TargetNotice({ target }: { target: Extract<KnowledgeTarget, { kind: 'empty' }> }) {
  const what = target.what === 'project' ? '프로젝트' : '지식 베이스'
  return <Callout tone="warn" icon="circle-help">{what}가 없습니다. 로컬 환경을 처음 세운 상태라면 백엔드 부트스트랩이 먼저입니다.</Callout>
}

/**
 * 후보가 여럿일 때만 드롭다운을 그린다. 1건이면 자동 선택돼 여기 오지 않는다.
 *
 * <p>디자인은 최소다 — 이번 범위는 "동작한다"이지 "다듬는다"가 아니다.
 */
function TargetPicker({ target, onPick }: {
  target: Extract<KnowledgeTarget, { kind: 'ready' | 'choose' }>
  onPick: (what: 'project' | 'knowledgeBase', id: string) => void
}) {
  const projects: Project[] = target.projects
  const bases: KnowledgeBase[] = target.bases ?? []
  const needsProject = projects.length > 1
  const needsBase = bases.length > 1
  if (!needsProject && !needsBase) return null

  return <section className={panel}>
    <div className="flex flex-wrap items-end gap-4 px-4 py-3">
      {needsProject && <Field
        label="프로젝트"
        value={target.project?.projectId ?? ''}
        options={projects.map((item) => ({ id: item.projectId, name: item.name }))}
        onPick={(id) => onPick('project', id)}
      />}
      {needsBase && <Field
        label="지식 베이스"
        value={target.kind === 'ready' ? target.knowledgeBaseId : ''}
        options={bases.map((item) => ({ id: item.knowledgeBaseId, name: item.name }))}
        onPick={(id) => onPick('knowledgeBase', id)}
      />}
      {target.kind === 'choose' && <p className="m-0 text-[0.6875rem] text-muted-3">
        후보가 여럿이라 자동으로 고르지 않습니다 — 잘못된 대상을 보고도 모르게 되기 때문입니다.
      </p>}
    </div>
  </section>
}

function Field({ label, value, options, onPick }: {
  label: string
  value: string
  options: { id: string; name: string }[]
  onPick: (id: string) => void
}) {
  return <label className="flex flex-col gap-1 text-[0.6875rem] text-muted-3">
    {label}
    <select
      value={value}
      onChange={(event) => onPick(event.target.value)}
      className="min-w-[14rem] rounded-[0.3125rem] border border-field-line bg-white px-2 py-[0.375rem] text-xs text-ink"
    >
      <option value="" disabled>선택하세요</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select>
  </label>
}

/** A2 요약. 활성 버전이 없으면 그렇게 말한다(콜드 스타트·전 버전 보관 상태). */
function Summary({ active, name, loading, blocked }: { active: KnowledgeVersion | null; name: string | null; loading: boolean; blocked: boolean }) {
  const placeholder = blocked ? '—' : loading ? '조회 중…' : '없음'
  const cells = [
    { label: '활성 버전', value: active ? `v${active.versionNumber}` : placeholder },
    { label: '문서', value: active ? String(active.documentCount) : '—' },
    { label: '청크', value: active ? String(active.chunkCount) : '—' },
    { label: '활성화', value: active?.activatedAt ? new Date(active.activatedAt).toLocaleString('ko-KR') : '—' },
  ]
  return <section className={panel}>
    <PanelTitle title={name ?? '지식 베이스'} sub={active?.label ?? undefined} />
    <div className="grid sm:grid-cols-2 xl:grid-cols-4">
      {cells.map((cell) => <div key={cell.label} className="border-r border-row-line px-4 py-[0.875rem]">
        <small className="block text-[0.65625rem] text-muted-3">{cell.label}</small>
        <b className="mt-[0.3125rem] block text-[0.78125rem] font-semibold">{cell.value}</b>
      </div>)}
    </div>
  </section>
}

/**
 * A3 진행. **경과 시간이 주 표시**이고 단계 점등은 보조다 — 9/6 실측에서 `CHUNK` 45%에
 * 8분 36초 머물다 끝에 한 번에 넘어갔다. 진행률 바와 건수 표기는 쓰지 않는다.
 */
function BuildProgress({ view }: { view: BuildView }) {
  const states = stepStates(view.phase)
  return <section className={panel}>
    <PanelTitle title="RAG Build 진행" sub={`v${view.version.versionNumber}`}>
      <Badge tone={view.stalled ? 'fail' : 'run'}>{view.stalled ? '정체' : '진행 중'}</Badge>
    </PanelTitle>
    <div className="px-4 pb-4 pt-[0.875rem]">
      <p className="m-0 text-[0.8125rem] font-semibold text-ink">
        지식 빌드 진행 중 · {formatElapsed(view.elapsedMs)} 경과 <span className="font-normal text-muted-2">(통상 8분대)</span>
      </p>

      {view.stalled && <Callout tone="warn" icon="triangle-alert">
        응답이 정체됐습니다 · {formatElapsed(view.elapsedMs)} 경과. 컨테이너 로그에서
        <code className="mx-1 font-mono text-[0.6875rem]">Executing step: [productEmbed]</code>를 확인하세요.
        화면만으로는 진행 중인지 멈춘 건지 판정할 수 없습니다.
      </Callout>}

      {view.failure && <Callout tone="warn" icon="triangle-alert">
        {view.failure.code} · {view.failure.message}{view.failure.retryable ? ' (재시도 가능)' : ''}
      </Callout>}

      {/* 보조 표시. job이 없으면 전부 꺼진 채로 두고 위의 경과 시간만 말한다. */}
      <div className="mt-3 flex flex-wrap gap-[0.375rem]">
        {BUILD_STEPS.map((step, index) => <span
          key={step}
          className={`rounded-[0.3125rem] border px-2 py-1 text-[0.6875rem] ${
            states[index] === 'done' ? 'border-ok-fg/30 bg-ok-bg text-ok-fg'
              : states[index] === 'active' ? 'border-run-fg/30 bg-run-bg font-semibold text-run-fg'
                : 'border-line-soft text-muted-3'}`}
        >{step}</span>)}
      </div>
      {view.phase == null && <p className="m-0 mt-2 text-[0.6875rem] text-muted-3">
        단계 정보를 읽을 수 없어 진행 여부만 표시합니다.
      </p>}
    </div>
  </section>
}

/**
 * A4 품질 지표. **계약에 지표가 없다** — `knowledge_version.score`는 EVALUATE가 무조건
 * 100으로 세우는 값이라 품질이 아니다. 오프라인 실측 스냅샷을 출처와 함께 정적으로 싣는다.
 *
 * <p>**Faithfulness는 싣지 않는다.** 97/246건이고 21개 카테고리 중 12종이 0건이라
 * 모집단 추정치로 쓸 수 없다. 게이지 한 줄이 그 조건을 담지 못한다.
 */
const OFFLINE_METRICS = [
  { label: 'Recall@5 전체', value: '0.975' },
  { label: 'Recall@10 전체', value: '0.990' },
  { label: 'MRR@10', value: '0.970' },
  { label: 'Recall@5 · C 유형', value: '0.897' },
]

function QualityMetrics() {
  return <section className={panel}>
    <PanelTitle title="품질 지표" sub="2026-08-29 측정 · 252 TC 전건 · 오프라인 실측 스냅샷" />
    <div className="grid gap-[0.875rem] px-4 pb-4 pt-[0.875rem] sm:grid-cols-2">
      {OFFLINE_METRICS.map((metric) => <div key={metric.label} className="flex items-center justify-between text-[0.71875rem] text-muted">
        <span>{metric.label}</span>
        <b className="font-mono text-[0.78125rem] font-semibold text-ink">{metric.value}</b>
      </div>)}
    </div>
    <p className="m-0 border-t border-line-soft px-4 py-[0.625rem] text-[0.6875rem] text-muted-3">
      실시간 값이 아닙니다 — 공개 계약에 품질 지표가 없어 오프라인 측정 결과를 싣습니다.
      Faithfulness는 표본이 모집단을 대표하지 못해(97/246건 · 12개 카테고리 0건) 싣지 않습니다.
    </p>
  </section>
}

/**
 * A5 지표 셀의 값. 최고 관리자가 `R@5 0.9747` 같은 원값을 해석할 거라고 가정하지 않는다 —
 * 활성 대비 R@5 델타·hit@5 건수·기준선 배지로 먼저 말하고 원값은 접어 둔다.
 *
 * <p>`hit5`는 **정답이 상위 5에 하나라도 포함된 문항 수**다(부분점수 합이 아니다). 델타 %p는
 * R@5 기준이라 hit@5 건수와는 서로 다른 양이다 — 건수로 델타를 다시 계산하지 않는다.
 *
 * <p>⚠️ **측정 후 교체 지점은 이 상수 묶음뿐이다.** 빌드의 evaluate 단계가 스텁이라
 * `knowledge_version.score`는 무조건 100이고(`admin-types.ts`) 서버 값을 지표로 쓸 수 없다.
 * 출처 라벨(`METRICS_SOURCE`)은 접힘 토글의 손잡이로 항상 보이게 둔다 — 라벨 없이 숫자만
 * 있으면 시스템이 방금 잰 것처럼 보이는 거짓말이 된다. 재측정이 나오면 아래 표와 출처
 * 날짜를 같이 바꾼다.
 *
 * <p>키는 `versionNumber`라 환경마다 다르다(함정 24) — 지금 값은 데모 DB(활성 v12) 기준
 * 2026-09-09 오프라인 실측이고, 표에 없는 버전은 "측정 전"으로 그린다.
 */
type OfflineMetrics = { r5: number; cType: number; mrr: number; hit5: number; appliedTo: string }

const VERSION_METRICS: Record<number, OfflineMetrics> = {
  12: { r5: 0.9747, cType: 0.8968, mrr: 0.9704, hit5: 250, appliedTo: 'v12 색인 실측' },
  17: { r5: 0.9546, cType: 0.7990, mrr: 0.9697, hit5: 249, appliedTo: 'v17 색인 실측' },
  18: { r5: 0.9747, cType: 0.8968, mrr: 0.9704, hit5: 250, appliedTo: 'v18 색인 실측' },
}
/** 오프라인 TC 전건. hit@5 건수의 분모다. */
const METRICS_TOTAL = 252
const BASELINE_R5 = 0.95
const BASELINE_C_TYPE = 0.85
const METRICS_SOURCE = '오프라인 측정 · 9/9'

function formatDeltaPp(r5: number, activeR5: number): string {
  // 0.9546-0.9747은 부동소수점 꼬리가 붙는다. 소수 2자리 %p로 자른다.
  const diff = Math.round((r5 - activeR5) * 10000) / 100
  return diff > 0 ? `▲ +${diff.toFixed(2)}%p` : diff < 0 ? `▼ ${diff.toFixed(2)}%p` : '±0.00%p'
}

/** 기준선을 못 넘은 지표를 사유 문자열로 만든다. 통과면 빈 배열. */
function baselineFailures(metrics: OfflineMetrics): string[] {
  const fails: string[] = []
  if (metrics.r5 < BASELINE_R5) fails.push(`R@5 ${metrics.r5.toFixed(4)} < ${BASELINE_R5}`)
  if (metrics.cType < BASELINE_C_TYPE) fails.push(`C유형 ${metrics.cType.toFixed(4)} < ${BASELINE_C_TYPE}`)
  return fails
}

function MetricsCell({ version, activeR5 }: { version: KnowledgeVersion; activeR5: number | null }) {
  // 실패(문서 0건)·빌드 중 버전은 잴 수 있는 색인이 없다 — 상수 키가 우연히 겹쳐도 그리지 않는다.
  const measurable = version.status === 'ACTIVE' || version.status === 'ARCHIVED' || version.status === 'APPROVAL_PENDING'
  const metrics = measurable ? VERSION_METRICS[version.versionNumber] : undefined
  if (!metrics) return <span className="text-[0.6875rem] text-muted-3">측정 전</span>
  const isActive = version.status === 'ACTIVE'
  // 활성 행은 비교 기준 자체라 델타가 없고, 활성 버전이 미측정이면 비교할 대상이 없다.
  const compare = !isActive && activeR5 != null
  const headline = isActive ? '검색 정확도 기준' : compare ? `검색 정확도 ${formatDeltaPp(metrics.r5, activeR5)}` : '검색 정확도'
  const fails = baselineFailures(metrics)
  return <span className="flex flex-col items-start gap-[0.1875rem]">
    <b className="text-[0.71875rem] font-semibold text-ink">{headline}</b>
    <span className="text-[0.6875rem] text-body">{`정답을 찾은 문항 ${metrics.hit5} / ${METRICS_TOTAL}`}</span>
    {/* 미달 사유는 접지 않는다 — 어느 지표가 왜 걸렸는지가 승인 판단의 근거다. */}
    <Badge tone={fails.length === 0 ? 'ok' : 'fail'}>
      {fails.length === 0 ? '기준선 통과' : `기준선 미달 · ${fails.join(' · ')}`}
    </Badge>
    {/* 출처 라벨이 토글 손잡이다. 접히는 것은 원값뿐 — 라벨 자체는 절대 접히지 않는다. */}
    <details>
      <summary className="cursor-pointer list-none text-[0.625rem] text-muted-3 [&::-webkit-details-marker]:hidden">
        {`${METRICS_SOURCE} ▾`}
      </summary>
      <span className="block font-mono text-[0.625rem] text-muted-2">
        {`R@5 ${metrics.r5.toFixed(4)} · C유형 ${metrics.cType.toFixed(4)} · MRR ${metrics.mrr.toFixed(4)}`}
      </span>
      <span className="block text-[0.625rem] text-muted-3">{`${METRICS_TOTAL} TC · ${metrics.appliedTo}`}</span>
    </details>
  </span>
}

/** A5 버전 테이블. 쓰기 버튼은 역할로 미리 판별해 disabled로 둔다 — 눌러서 403을 받지 않는다. */
function VersionTable({ versions, mayWrite, blocked, busy, canRollback, onSwitch, onRollback }: {
  versions: KnowledgeVersion[] | null
  mayWrite: boolean
  blocked: boolean
  busy: boolean
  canRollback: boolean
  onSwitch: (version: KnowledgeVersion) => void
  onRollback: () => void
}) {
  const columns = 'grid-cols-[minmax(0,1fr)_7rem_7rem_13rem_9rem_8rem]'
  const [showAll, setShowAll] = useState(false)
  const shown = versions == null ? null : showAll ? versions : visibleVersions(versions)
  const hidden = versions == null || shown == null ? 0 : versions.length - shown.length
  const activeVersion = versions?.find((v) => v.status === 'ACTIVE') ?? null
  const activeR5 = activeVersion ? VERSION_METRICS[activeVersion.versionNumber]?.r5 ?? null : null
  return <section className={panel}>
    <PanelTitle title="RAG 버전" sub={versions ? `${versions.length}건` : undefined}>
      <button
        className={smallButton}
        disabled={busy || !canRollback}
        onClick={onRollback}
        title={!mayWrite ? WRITE_DENIED : canRollback ? '마지막으로 활성화됐던 버전으로 되돌립니다.' : '되돌릴 이전 활성 버전이 없습니다.'}
      >이전 활성 버전으로 롤백</button>
    </PanelTitle>
    <div className="overflow-x-auto">
      <div className="min-w-[56.75rem]">
        <div className={`${headRow} ${columns}`}>
          <span>버전</span><span>상태</span><span>문서/청크</span><span>지표</span><span>활성화</span><span className="text-right">동작</span>
        </div>
        {versions == null && <div className="px-4 py-6 text-xs text-muted-3">
          {blocked ? '위 안내를 해결해야 버전을 불러올 수 있습니다.' : '버전을 불러오는 중…'}
        </div>}
        {shown?.length === 0 && <div className="px-4 py-6 text-xs text-muted-3">버전이 없습니다.</div>}
        {shown?.map((version) => <div key={version.knowledgeVersionId} className={`${bodyRow} ${columns}`}>
          <span className="flex items-center gap-2">
            <b className="text-[0.78125rem] font-semibold text-ink">v{version.versionNumber}</b>
            {version.label && <small className="truncate text-[0.6875rem] text-muted-3">{version.label}</small>}
          </span>
          <span><Badge tone={STATUS_TONE[version.status]}>{STATUS_LABEL[version.status]}</Badge></span>
          <span className="font-mono">{version.documentCount}/{version.chunkCount}</span>
          <MetricsCell version={version} activeR5={activeR5} />
          <span className="font-mono text-[0.6875rem]">{version.activatedAt ? new Date(version.activatedAt).toLocaleDateString('ko-KR') : '—'}</span>
          <span className="flex justify-end">
            {version.status === 'ACTIVE'
              ? <small className="text-[0.6875rem] text-ok-fg">현재 활성</small>
              : <button
                className={smallButton}
                disabled={busy || switchPath(version.status) == null}
                onClick={() => onSwitch(version)}
                title={!mayWrite ? WRITE_DENIED : NOT_SWITCHABLE[version.status] ?? `포털이 v${version.versionNumber} 기준으로 답하게 합니다.`}
              >전환</button>}
          </span>
        </div>)}
        {hidden > 0 && <button
          type="button"
          className="w-full border-t border-line bg-transparent px-4 py-[0.625rem] text-left text-[0.6875rem] text-muted-3 hover:text-muted"
          onClick={() => setShowAll(true)}
        >이전 버전 {hidden}건 더 보기</button>}
        {showAll && versions != null && versions.length > ALWAYS_VISIBLE_RECENT && <button
          type="button"
          className="w-full border-t border-line bg-transparent px-4 py-[0.625rem] text-left text-[0.6875rem] text-muted-3 hover:text-muted"
          onClick={() => setShowAll(false)}
        >접기</button>}
      </div>
    </div>
  </section>
}

const headRow = 'bg-sub px-4 py-2 text-[0.6875rem] font-semibold text-muted-2 border-b border-line-soft grid'
const bodyRow = 'grid items-center border-b border-row-line px-4 py-[0.625rem] text-xs text-body'
