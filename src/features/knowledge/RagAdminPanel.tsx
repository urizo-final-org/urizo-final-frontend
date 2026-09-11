import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { describeFailure } from '../../shared/api/error'
import type { AdminRole } from '../../shared/api/session'
import { Badge, Callout, PageHead, PanelTitle, panel, primaryButton, secondaryButton, smallButton, type Tone } from '../../shared/ui/primitives'
import { Icon } from '../../shared/ui/icons'
import { ActivationRequests } from './ActivationRequests'
import { noHover } from './no-hover'
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
 * 데이터 소스 추가(커넥터 — 도메인 교체 흐름을 시연에서 빼기로 해 버튼도 지웠다).
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

/**
 * 표 안의 액션 버튼. 공용 `smallButton`은 배경이 패널과 같아 링크처럼 보였다 —
 * 배경·여백·모서리를 주어 「누를 수 있는 것」으로 읽히게 한다. hover 색 변화는 두지 않는다 —
 * 시연 화면에서 마우스가 표 위를 지나갈 때마다 버튼이 깜빡이는 것으로 보였다.
 *
 * <p>**공용 `primaryButton`을 쓰지 않는 이유**: `admin-theme.css`의
 * `.admin-app button { color: inherit }`가 명시도(0,1,1)에서 Tailwind `text-white`(0,1,0)를
 * 이겨, 남색 배경에 남색 글자가 되어 글자가 보이지 않는다. 앱 전체 36곳이 같은 조건이라
 * 공용 수정은 다른 담당자 화면까지 건드린다 — 여기서는 이 버튼만 표 버튼과 같은 형태로 둔다.
 *
 * <p>채움에 `line` 토큰을 쓴다. 이름은 선이지만 값이 라이트 #dfe6ed · 다크 #294156이라
 * **양쪽 테마에서 패널과 확실히 구분되는 유일한 기존 토큰**이다. `sub`(#f8fafc)는 흰 패널과
 * 붙어 보여 링크처럼 읽혔다. 공용 테마 CSS를 건드리지 않으려고 기존 값을 재사용한다.
 */
const tableButton = 'inline-flex h-8 items-center justify-center gap-1 rounded-md border border-field-line bg-line px-4 text-[0.71875rem] font-semibold text-strong shadow-[0_1px_1px_#10203410] disabled:opacity-45'


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
  // 활성화·롤백이 곧 요청 처리다. 서버가 그때 열린 요청을 닫으므로 쓰기 성공 뒤
  // 요청 목록도 다시 읽어 사라지는 것을 보인다 — 버전 목록만 갱신하면 처리된 요청이 남아 보인다.
  const [requestsKey, setRequestsKey] = useState(0)
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
      if (alive.current) { setBusy(false); setConfirmation(null); setRequestsKey((key) => key + 1) }
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
      <button
        className={tableButton}
        disabled={!canWrite || busy || newest == null || view != null}
        onClick={askBuild}
        title={!mayWrite ? WRITE_DENIED : view != null ? '이미 빌드가 진행 중입니다.' : '새 지식 버전을 만듭니다 (8분대).'}
      >Build 시작</button>
    </PageHead>

    {/* 이 문장은 원래 아무 데로도 가지 않았다. 이제 아래 요청 패널이 그 경로다. */}
    {!mayWrite && <Callout tone="warn" icon="lock">조회만 가능합니다. {WRITE_DENIED} 아래 「갱신 요청」에 남기면 그대로 전달됩니다.</Callout>}
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
      <ActivationRequests
        api={api}
        knowledgeBaseId={knowledgeBaseId}
        mayWrite={mayWrite}
        versions={versions}
        refreshKey={requestsKey}
      />
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
        <button className={noHover(secondaryButton)} onClick={onCancel} disabled={busy}>취소</button>
        <button className={tableButton} onClick={onConfirm} disabled={busy}>
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
/**
 * 값만 늘어놓으면 `0.897`이 좋은 값인지 나쁜 값인지 알 수 없다. 기준선을 함께 들고
 * 상태 점·미니 바로 통과 여부를 먼저 보이고, 용어는 ⓘ 툴팁으로 푼다.
 *
 * <p>바는 **0~1 전 구간**을 그린다. 0.8~1.0으로 잘라 그리면 차이가 커 보이지만 눈금을
 * 속이는 것이다. 대신 기준선 위치에 눈금을 세워 "넘었는가"를 읽게 한다.
 */
const OFFLINE_METRICS = [
  { label: 'Recall@5 전체', value: 0.975, baseline: 0.95,
    hint: '질문 100개 중 정답 문서가 상위 5개 안에 들어온 비율입니다. 높을수록 좋습니다.' },
  { label: 'Recall@10 전체', value: 0.990, baseline: 0.95,
    hint: '상위 10개까지 넓혔을 때의 같은 비율입니다.' },
  { label: 'MRR@10', value: 0.970, baseline: 0.94,
    hint: '정답이 몇 번째로 나왔는지를 점수로 바꾼 값입니다. 1에 가까울수록 정답이 앞쪽에 있습니다.' },
  { label: 'Recall@5 · C 유형', value: 0.897, baseline: 0.85,
    hint: '여러 곳을 엮어 묻는 어려운 질문만 따로 잰 값입니다. 구조적으로 어려워 기준선이 낮습니다.' },
]

/** 용어 옆 ⓘ. 네이티브 title이라 클리핑·라이브러리 없이 어디에나 붙는다. */
function InfoTip({ hint }: { hint: string }) {
  return <span className="cursor-help text-muted-3 hover:text-muted" title={hint} aria-label={hint}>
    <Icon name="circle-help" size={11} />
  </span>
}

function QualityMetrics() {
  return <section className={panel}>
    <PanelTitle title="품질 지표" sub="2026-08-29 측정 · 252 TC 전건 · 오프라인 실측 스냅샷" />
    <div className="grid gap-x-6 gap-y-[0.875rem] px-4 pb-4 pt-[0.875rem] sm:grid-cols-2">
      {OFFLINE_METRICS.map((metric) => {
        const passes = metric.value >= metric.baseline
        return <div key={metric.label} className="flex flex-col gap-[0.3125rem]">
          <div className="flex items-center justify-between gap-2 text-[0.71875rem] text-muted">
            <span className="flex items-center gap-1">{metric.label}<InfoTip hint={metric.hint} /></span>
            <span className="flex items-center gap-[0.375rem]">
              <span
                className={`h-[0.4375rem] w-[0.4375rem] rounded-full ${passes ? 'bg-ok-fg' : 'bg-fail-fg'}`}
                title={passes ? `기준선 ${metric.baseline} 통과` : `기준선 ${metric.baseline} 미달`}
              />
              <b className="font-mono text-[0.78125rem] font-semibold text-ink">{metric.value.toFixed(3)}</b>
            </span>
          </div>
          {/* 0~1 전 구간. 눈금은 기준선 위치다 — 넘었는지를 눈으로 읽는 유일한 표식이다. */}
          <div className="relative h-[0.25rem] w-full overflow-hidden rounded-full bg-sub" title={`기준선 ${metric.baseline}`}>
            <div
              className={`h-full rounded-full ${passes ? 'bg-ok-fg' : 'bg-fail-fg'}`}
              style={{ width: `${metric.value * 100}%` }}
            />
            <span className="absolute inset-y-0 w-px bg-muted-2" style={{ left: `${metric.baseline * 100}%` }} />
          </div>
        </div>
      })}
    </div>
  </section>
}

/**
 * A5 지표 셀의 값. 최고 관리자가 `R@5 0.9747` 같은 원값을 해석할 거라고 가정하지 않는다 —
 * 활성 대비 R@5 델타·hit@5 건수·기준선 배지로 먼저 말하고 원값은 접어 둔다.
 *
 * <p>`hit5`는 **정답이 상위 5에 하나라도 포함된 문항 수**다(부분점수 합이 아니다). 델타 %p는
 * R@5 기준이라 hit@5 건수와는 서로 다른 양이다 — 건수로 델타를 다시 계산하지 않는다.
 *
 * <p>⚠️ **키는 `knowledgeVersionId`(UUID)다.** 이전 판은 `versionNumber`로 묶어서, 다른 환경
 * DB가 같은 번호를 재사용하면 **엉뚱한 버전에 이 측정치가 붙었다**(`7514ee0`에서 제거된 이유).
 * UUID는 환경 간에 겹치지 않으므로 오표시가 구조적으로 불가능하다 — 모르는 버전에는 아무것도
 * 그리지 않고, 그릴 것이 하나도 없으면 지표 열 자체가 사라진다.
 *
 * <p>⚠️ **측정 후 교체 지점은 이 상수 묶음뿐이다.** 빌드의 evaluate 단계가 스텁이라
 * `knowledge_version.score`는 무조건 100이고 서버 값을 지표로 쓸 수 없다. 출처
 * 라벨(`METRICS_SOURCE`)은 접힘 토글의 손잡이로 항상 보이게 둔다 — 라벨 없이 숫자만 있으면
 * 시스템이 방금 잰 것처럼 보이는 거짓말이 된다. evaluate가 실제로 재게 되면 통째로 사라질 자리다.
 */
type OfflineMetrics = { r5: number; cType: number; mrr: number; hit5: number }

const VERSION_METRICS: Record<string, OfflineMetrics> = {
  // 데모 DB 2026-09-09 오프라인 실측. 순서대로 v12(활성) · v17(색인 전략 변경 · 기준선 미달) · v18(만료 라벨만).
  '27c887bc-b528-4099-af77-e8da92751e2a': { r5: 0.9747, cType: 0.8968, mrr: 0.9704, hit5: 250 },
  'e6da49bf-26f2-4f80-ba6d-b4995311e53e': { r5: 0.9546, cType: 0.7990, mrr: 0.9697, hit5: 249 },
  '2d239788-9cef-4bcf-ab30-f8e3d5b0f449': { r5: 0.9747, cType: 0.8968, mrr: 0.9704, hit5: 250 },
}
/**
 * 같은 구성으로 다시 빌드된 버전이 물려받는 측정치. 키는 `커넥터:문서수:청크수`다.
 *
 * <p>UUID는 빌드마다 새로 생기므로 방금 만든 버전은 `VERSION_METRICS`에 걸리지 않는다.
 * 그런데 지표가 붙는 대상은 사실 버전 행이 아니라 **색인 구성**이다 — 같은 커넥터로 같은
 * 문서·청크 수가 나왔다면 그 색인은 이미 잰 것과 같고, 검색 정확도도 같다. 그래서 그때만
 * 이전 측정치를 물려주고, 출처 라벨을 `METRICS_REUSED_SOURCE`로 바꿔 **방금 잰 값이 아님을
 * 화면에 밝힌다.**
 *
 * <p>⚠️ 구성이 다른데 문서·청크 수만 우연히 같은 버전은 이 지문으로 가려낼 수 없다(v2가 그런
 * 경우다 — 색인 전략만 바꿔 500/500이 그대로다). 그런 버전은 반드시 `VERSION_METRICS`에
 * UUID로 고정해 둔다. UUID 항목이 먼저 이기므로 v2는 자기 미달 수치를 그대로 쓴다.
 */
const CONFIG_METRICS: Record<string, OfflineMetrics> = {
  // 픽스처 커넥터 500문서/500청크 = v12·v18과 같은 색인. 9/9 실측을 그대로 쓴다.
  'd52ab2fa-7b84-4132-8dec-f688144f9287:500:500': { r5: 0.9747, cType: 0.8968, mrr: 0.9704, hit5: 250 },
}

/** 오프라인 TC 전건. hit@5 건수의 분모다. */
const METRICS_TOTAL = 252
const BASELINE_R5 = 0.95
const BASELINE_C_TYPE = 0.85
const METRICS_SOURCE = '오프라인 측정 · 9/9'
const METRICS_REUSED_SOURCE = '오프라인 측정 · 9/9 · 같은 구성 재사용'

type MetricsHit = { metrics: OfflineMetrics; reused: boolean }

function configKey(version: KnowledgeVersion): string {
  return `${version.connectorVersionId}:${version.documentCount}:${version.chunkCount}`
}

/** 실패(문서 0건)·빌드 중 버전은 잴 색인이 없다 — 키가 있어도 그리지 않는다. */
function offlineMetrics(version: KnowledgeVersion): MetricsHit | undefined {
  const measurable = version.status === 'ACTIVE' || version.status === 'ARCHIVED' || version.status === 'APPROVAL_PENDING'
  if (!measurable) return undefined
  // UUID 고정이 먼저다. 구성이 같아 보여도 다르게 잰 버전(v2)이 여기서 갈린다.
  const pinned = VERSION_METRICS[version.knowledgeVersionId]
  if (pinned) return { metrics: pinned, reused: false }
  const inherited = CONFIG_METRICS[configKey(version)]
  return inherited ? { metrics: inherited, reused: true } : undefined
}

function formatDeltaPp(r5: number, activeR5: number): string {
  // 화면에 보이는 4자리에서 계산한다 — 토글을 열고 직접 빼봤을 때 맞아야 한다.
  const diff = Math.round((r5 - activeR5) * 10000) / 100
  return diff > 0 ? `▲ +${diff.toFixed(2)}%p` : diff < 0 ? `▼ ${diff.toFixed(2)}%p` : '±0.00%p'
}

/**
 * 기준선을 넘었는가. **어느 지표가 왜 걸렸는지는 배지에 쓰지 않는다** —
 * `C유형 0.7990 < 0.85`는 이 프로젝트 밖의 사람에게 읽히지 않는 표기이고,
 * 원값은 바로 아래 접힘(`METRICS_SOURCE` 토글)에 그대로 있다.
 */
function meetsBaseline(metrics: OfflineMetrics): boolean {
  return metrics.r5 >= BASELINE_R5 && metrics.cType >= BASELINE_C_TYPE
}

function MetricsCell({ version, activeR5 }: { version: KnowledgeVersion; activeR5: number | null }) {
  const hit = offlineMetrics(version)
  if (!hit) return <span className="text-[0.6875rem] text-muted-3">측정 전</span>
  const { metrics, reused } = hit
  const isActive = version.status === 'ACTIVE'
  // 활성 행은 비교 기준 자체라 델타가 없고, 활성 버전이 미측정이면 비교할 대상이 없다.
  const compare = !isActive && activeR5 != null
  const headline = isActive ? '검색 정확도 기준' : compare ? `검색 정확도 ${formatDeltaPp(metrics.r5, activeR5)}` : '검색 정확도'
  const passes = meetsBaseline(metrics)
  // 세부 수치는 셀 hover로 미룬다. 표에서 한눈에 읽어야 하는 것은 델타와 통과 여부뿐이다.
  const detail = `정답을 찾은 문항 ${metrics.hit5} / ${METRICS_TOTAL}`
  return <span className="flex flex-col items-start gap-[0.1875rem]" title={detail}>
    <b className="text-[0.71875rem] font-semibold text-ink">{headline}</b>
    <Badge tone={passes ? 'ok' : 'fail'}>{passes ? '기준선 통과' : '기준선 미달'}</Badge>
    {/* 출처 라벨이 토글 손잡이다. 접히는 것은 원값뿐 — 라벨 자체는 절대 접히지 않는다. */}
    <details>
      <summary className="cursor-pointer list-none text-[0.625rem] text-muted-3 [&::-webkit-details-marker]:hidden">
        {`${reused ? METRICS_REUSED_SOURCE : METRICS_SOURCE} ▾`}
      </summary>
      <span className="block font-mono text-[0.625rem] text-muted-2">
        {`R@5 ${metrics.r5.toFixed(4)} · C유형 ${metrics.cType.toFixed(4)} · MRR ${metrics.mrr.toFixed(4)}`}
      </span>
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
  const [showAll, setShowAll] = useState(false)
  const shown = versions == null ? null : showAll ? versions : visibleVersions(versions)
  const activeVersion = versions?.find((v) => v.status === 'ACTIVE') ?? null
  const activeR5 = activeVersion ? offlineMetrics(activeVersion)?.metrics.r5 ?? null : null
  // 보이는 버전 중 하나라도 측정치가 있을 때만 열을 만든다. 이 환경의 버전을 하나도 모르면
  // "측정 전"만 늘어놓는 빈 열이 되므로 아예 없는 편이 낫다.
  const hasMetrics = (shown ?? []).some((version) => offlineMetrics(version) != null)
  // 전체 100%를 비율로 나눈다 — 지표에 1fr을 주면 남는 폭을 전부 먹어 텅 비어 보인다.
  const columns = hasMetrics
    ? 'grid-cols-[10fr_15fr_15fr_35fr_15fr_10fr]'
    : 'grid-cols-[12fr_18fr_18fr_40fr_12fr]'
  const hidden = versions == null || shown == null ? 0 : versions.length - shown.length
  return <section className={panel}>
    <PanelTitle title="RAG 버전" sub={versions ? `${versions.length}건` : undefined}>
      <button
        className={tableButton}
        disabled={busy || !canRollback}
        onClick={onRollback}
        title={!mayWrite ? WRITE_DENIED : canRollback ? '마지막으로 활성화됐던 버전으로 되돌립니다.' : '되돌릴 이전 활성 버전이 없습니다.'}
      >이전 버전 롤백</button>
    </PanelTitle>
    <div className="overflow-x-auto">
      <div className="min-w-[44rem]">
        <div className={`${headRow} ${columns}`}>
          <span>버전</span><span>상태</span><span>문서/청크</span>{hasMetrics && <span>지표</span>}<span>활성화</span><span className="text-right">동작</span>
        </div>
        {versions == null && <div className="px-4 py-6 text-xs text-muted-3">
          {blocked ? '위 안내를 해결해야 버전을 불러올 수 있습니다.' : '버전을 불러오는 중…'}
        </div>}
        {shown?.length === 0 && <div className="px-4 py-6 text-xs text-muted-3">버전이 없습니다.</div>}
        {shown?.map((version) => <div key={version.knowledgeVersionId} className={`${bodyRow} ${columns}`}>
          <span><b className="text-[0.78125rem] font-semibold text-ink">v{version.versionNumber}</b></span>
          <span><Badge tone={STATUS_TONE[version.status]}>{STATUS_LABEL[version.status]}</Badge></span>
          <span className="font-mono">{version.documentCount}/{version.chunkCount}</span>
          {hasMetrics && <MetricsCell version={version} activeR5={activeR5} />}
          <span className="font-mono text-[0.6875rem]">{version.activatedAt ? new Date(version.activatedAt).toLocaleDateString('ko-KR') : '—'}</span>
          <span className="flex justify-end">
            {version.status === 'ACTIVE'
              ? <small className="text-[0.6875rem] text-ok-fg">현재 활성</small>
              : <button
                className={tableButton}
                disabled={busy || switchPath(version.status) == null}
                onClick={() => onSwitch(version)}
                title={!mayWrite ? WRITE_DENIED : NOT_SWITCHABLE[version.status] ?? `포털이 v${version.versionNumber} 기준으로 답하게 합니다.`}
              ><Icon name="repeat" size={12} />전환</button>}
          </span>
        </div>)}
        {hidden > 0 && <button
          type="button"
          className="w-full border-t border-line bg-transparent px-4 py-[0.625rem] text-left text-[0.6875rem] text-muted-3"
          onClick={() => setShowAll(true)}
        >이전 버전 {hidden}건 더 보기</button>}
        {showAll && versions != null && versions.length > ALWAYS_VISIBLE_RECENT && <button
          type="button"
          className="w-full border-t border-line bg-transparent px-4 py-[0.625rem] text-left text-[0.6875rem] text-muted-3"
          onClick={() => setShowAll(false)}
        >접기</button>}
      </div>
    </div>
  </section>
}

const headRow = 'bg-sub px-4 py-2 text-[0.6875rem] font-semibold text-muted-2 border-b border-line-soft grid'
const bodyRow = 'grid items-center border-b border-row-line px-4 py-[0.625rem] text-xs text-body'
