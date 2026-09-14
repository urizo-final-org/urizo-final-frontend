import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { portalPathOf } from '../site/portal-projects'
import { describeFailure } from '../../shared/api/error'
import type { AdminRole } from '../../shared/api/session'
import { Badge, Callout, PageHead, PanelTitle, panel, primaryButton, secondaryButton, smallButton, tableButton, type Tone } from '../../shared/ui/primitives'
import { Icon } from '../../shared/ui/icons'
import { ActivationRequests } from './ActivationRequests'
import { ConnectorPanel } from './ConnectorPanel'
import { TourDiagnosisPanel } from './TourDiagnosis'
import { noHover } from './no-hover'
import { KnowledgeAdminApi } from './admin-api'
import type { BuildEvaluation, Connector, KnowledgeBase, KnowledgeTarget, KnowledgeVersion, KnowledgeVersionStatus, AgentJob, Project } from './admin-types'
import { buildView, findInProgress, formatElapsed, BUILD_STEPS, BUILD_STEP_LABEL, stepStates, type BuildView } from './build-progress'

/**
 * `/admin/rag` 실배선(C). 목업이던 `OpsWorkspace.Rag()`를 대체한다.
 *
 * <p>UI가 `features/ops`에 있었으나 AGENTS.md가 지정한 자리는 `features/knowledge`다.
 * 실연동 코드를 `ops`에 쌓으면 경계를 되돌리기 어려워 여기에 둔다. `ops`의 나머지 화면
 * 이동은 별도 작업이다.
 *
 * <p>**범위 밖**: 알림 패널(폐기) · 질의 콘솔 A1(폐기 — 실동작 챗봇은 포털에만).
 *
 * <p>데이터 소스(커넥터)는 `AXMS-AI02-013`에서 시연 동선 밖이라 버튼까지 지웠다가
 * `AXMS-AI02-016`에서 되돌렸다 — 2호 도메인 교체가 범위에 들어오면서 자료원을 사람이 SQL로
 * 넣어야 하는 것이 막는 벽이 됐다. `ConnectorPanel`이 그 자리다.
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

/**
 * 왜 못 누르는가. 쓰기 4종은 전부 SUPER_ADMIN 전용이다(`SecurityConfig:127-134`).
 *
 * <p>**역할 코드를 화면에 쓰지 않는다** — 읽는 사람은 관리자이지
 * 개발자가 아니고, 화면의 다른 문구는 이미 "최고 관리자"라고 부른다.
 *
 * <p>무엇을 하면 되는지는 여기 넣지 않는다. 쓰는 자리마다 다음 행동이 다르고, 붙여 쓰면
 * "최고 관리자의 권한이 필요합니다. 최고 관리자에게 요청하세요."처럼 같은 말이 겹친다.
 */
const WRITE_DENIED = '최고 관리자의 권한이 필요합니다.'
/** 비활성 버튼 툴팁 — 이유에 갈 곳을 붙인다. */
const WRITE_DENIED_HINT = `${WRITE_DENIED} 아래 「갱신 요청」에 남겨 주세요.`

const STATUS_TONE: Record<KnowledgeVersionStatus, Tone> = {
  BUILD_REQUESTED: 'run', BUILDING: 'run', APPROVAL_PENDING: 'wait',
  ACTIVE: 'ok', ARCHIVED: 'idle', FAILED: 'fail',
}

const STATUS_LABEL: Record<KnowledgeVersionStatus, string> = {
  BUILD_REQUESTED: '만들기 대기', BUILDING: '만드는 중', APPROVAL_PENDING: '승인 대기',
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
  FAILED: '실패한 자료는 활성화할 수 없습니다.',
  BUILDING: '자료 만들기가 끝나야 활성화할 수 있습니다.',
  BUILD_REQUESTED: '자료 만들기가 끝나야 활성화할 수 있습니다.',
}

/*
 * 버전 표는 접지 않는다. 한때 "활성 · 승인 대기 · 최신 N건"만 펼치고 나머지를 접었는데,
 * 접힘은 이 화면이 답해야 할 질문("버전끼리 무엇이 다른가")을 오히려 가렸다 — v3을 만들면
 * v1이 보관으로 밀려 접힘 안으로 들어가, 비교 대상이 화면에서 사라졌다.
 *
 * 버전은 지우지 않으므로 목록은 계속 길어진다. 길어지면 표가 스크롤될 뿐이고, 그 편이
 * "무엇이 숨어 있는지 모르는" 상태보다 낫다.
 */

/** 확인 창 하나로 쓰기 3종을 받는다. 되돌리기 어려운 동작 앞에 사람 손을 한 번 더 둔다. */
/**
 * 확인창 한 건.
 *
 * <p>`sources`가 있으면 창이 "어느 자료를 모을지"를 먼저 묻고, 고른 것을 `run`에 넘긴다.
 * 고르는 상태를 창이 들고 있는 이유는 취소하면 그대로 버려져야 하기 때문이다 —
 * 패널에 두면 창을 닫았다 열어도 지난 선택이 남는다.
 */
type Confirmation = {
  title: string
  lines: string[]
  label: string
  run: (sources?: BuildSources) => Promise<unknown>
  /**
   * 있으면 창이 원천 선택을 보여준다. 목록은 여기 담지 않는다 — 창이 열리는 순간
   * 커넥터 목록이 아직 안 왔을 수 있어, 그때 담으면 영영 빈 목록으로 굳는다.
   */
  sources?: { base: string }
}

/** BASE는 문서 집합을 만들고, OVERLAY는 그 문서에 정보를 덧붙인다(계약상 최대 4). */
export type BuildSources = { base: string; overlays: string[] }
const MAX_OVERLAYS = 4

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
  /** 진단 중인 버전(AI02-027). 한 번에 하나만 연다 — 30초짜리 조사를 여럿 띄울 이유가 없다. */
  const [diagnosing, setDiagnosing] = useState<KnowledgeVersion | null>(null)
  /** 빌드 확인창이 쓸 원천 목록. 아래 커넥터 패널이 읽은 것을 그대로 받는다. */
  const [connectors, setConnectors] = useState<Connector[] | null>(null)
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

  // 선택된 지식베이스의 원천 변경 요약(AI02-022). 0건 요약은 "점검했고 이상 없음"이라 그리지 않는다.
  const storedSummary = target?.kind === 'ready'
    ? target.bases.find((base) => base.knowledgeBaseId === target.knowledgeBaseId)?.sourceChangeSummary
    : undefined
  const changeSummary = storedSummary
    && storedSummary.added + storedSummary.modified + storedSummary.missing > 0
    ? storedSummary : undefined

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
  const previousActive = previousActiveOf(versions)

  /** 확인 창에서 승인했을 때만 실행한다. 성공하든 실패하든 목록을 다시 읽어 화면을 실제 상태에 맞춘다. */
  const runConfirmed = useCallback(async (picked?: BuildSources) => {
    if (!confirmation || !knowledgeBaseId) return
    setBusy(true)
    try {
      await confirmation.run(picked)
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
        `문서 ${version.documentCount}건`,
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
        `문서 ${previousActive.documentCount}건`,
        '포털 답변이 즉시 바뀝니다. 되돌린 버전은 보관됨으로 남습니다.',
      ],
      label: '롤백',
      run: () => api.rollback(knowledgeBaseId, previousActive.knowledgeVersionId),
    })
  }, [api, knowledgeBaseId, previousActive, active])

  /**
   * 자료 만들기. **어느 자료를 모을지 사람이 고른다**(AI02-027).
   *
   * <p>예전에는 최신 버전이 쓴 원천을 말없이 재사용했다. 그런데 최신 버전이 지금 서비스
   * 중인 버전과 다른 원천으로 만들어져 있으면, 관리자는 같은 자료를 다시 모은다고 믿고
   * 눌렀는데 <b>다른 자료</b>가 모인다. 실측에서 이것이 품질을 90%에서 68%로 떨어뜨렸고,
   * 화면 어디에도 그 사실이 드러나지 않았다.
   *
   * <p>기본값은 예전 동작 그대로다(최신 버전의 원천). 바꾸지 않고 누르면 전과 같다.
   */
  const askBuild = useCallback(() => {
    if (!knowledgeBaseId || !newest) return
    setConfirmation({
      title: '새 자료 만들기',
      lines: [
        '자료를 모아 검색할 수 있게 만드는 작업입니다. 약 8분 걸립니다.',
        '완료돼도 자동 활성화되지 않고 승인 대기 상태로 멈춥니다.',
        '진행 중에는 이 화면에서 경과 시간을 볼 수 있습니다.',
      ],
      label: '만들기 시작',
      sources: { base: newest.connectorVersionId },
      run: (picked) => api.startBuild(
        knowledgeBaseId,
        picked?.base ?? newest.connectorVersionId,
        `admin build ${new Date().toISOString().slice(0, 10)}`,
        picked?.overlays ?? [],
      ),
    })
  }, [api, knowledgeBaseId, newest])

  /**
   * 첫 빌드 진입점. **`Build 시작`은 새 지식 베이스에서 눌리지 않는다** — 최신 버전이 쓴
   * 커넥터를 재사용하는 구조라 버전이 0개면 `newest == null`이고 버튼이 꺼진다. 갓 만든
   * 고객사에서 첫 빌드를 시작할 길이 화면에 없었고, 그 자리가 시연 동선
   * (등록 → 커넥터 → 첫 빌드 → 활성화 → 포털)의 유일한 단절점이었다.
   *
   * <p>확인창·busy·목록 재조회는 기존 기계를 그대로 쓴다. 8분짜리 작업이 확인 없이
   * 시작되면 안 되고, 빌드의 주인은 여전히 이 화면이다 — `ConnectorPanel`은 어느 커넥터로
   * 시작할지만 알려 준다.
   */
  const askFirstBuild = useCallback((connector: Connector) => {
    if (!knowledgeBaseId) return
    setConfirmation({
      title: `${connector.name}으로 첫 자료 만들기`,
      lines: [
        '자료를 모아 검색할 수 있게 만드는 작업입니다. 약 8분 걸립니다.',
        '완료돼도 자동 활성화되지 않고 승인 대기 상태로 멈춥니다.',
        '이 지식 베이스의 첫 버전이 만들어집니다.',
      ],
      label: '만들기 시작',
      run: () => api.startBuild(knowledgeBaseId, connector.connectorVersionId, `first build ${new Date().toISOString().slice(0, 10)}`),
    })
  }, [api, knowledgeBaseId])

  const canWrite = mayWrite && knowledgeBaseId != null

  return <>
    {/* 고객사가 둘 이상이므로 한 도메인(관광)을 설명에 박아 두지 않는다. */}
    <PageHead title="RAG 관리" description="데이터를 검색 자료로 구축하고 버전별 품질을 비교·관리합니다.">
      <button
        className={tableButton}
        disabled={!canWrite || busy || newest == null || view != null}
        onClick={askBuild}
        title={!mayWrite ? WRITE_DENIED_HINT : view != null ? '이미 만드는 중입니다.' : '검색에 쓸 자료를 새로 만듭니다 (약 8분).'}
      >새 자료 만들기</button>
    </PageHead>

    {/* 스케줄러 감지분(AI02-022). 활성 버전 기준 괴리라 갱신(새 버전 활성화) 전까지 남는다.
        최고 관리자는 여기서 바로 만들 수 있다 — 알림을 본 사람과 조치할 수 있는 사람이
        같은데 다른 패널로 보내면, 읽고 나서 할 일을 한 번 더 찾아야 한다(AI02-027). */}
    {changeSummary && <Callout tone="warn" icon="triangle-alert">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-bold">원천 데이터가 바뀌었습니다</span>
        <span className="flex items-center gap-2">
          <ChangeCount label="신규" value={changeSummary.added} />
          <ChangeCount label="수정" value={changeSummary.modified} />
          <ChangeCount label="소멸" value={changeSummary.missing} />
        </span>
        <span className="text-[0.6875rem] opacity-80">
          {new Date(changeSummary.checkedAt).toLocaleString('ko-KR')} 확인 · 활성 v{changeSummary.comparedVersion} 기준
        </span>
        {mayWrite
          ? <button
              className={tableButton}
              disabled={busy || newest == null || view != null}
              onClick={askBuild}
              title={view != null ? '이미 만드는 중입니다.' : '바뀐 원천으로 검색 자료를 새로 만듭니다 (약 8분).'}
            >지금 새 자료 만들기</button>
          : <span>갱신은 최고 관리자가 합니다. 아래 「갱신 요청」에 남겨 주세요.</span>}
      </span>
    </Callout>}
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
        portalPath={target?.kind === 'ready'
          ? portalPathOf(target.projectId, target.project?.name ?? null) : null}
      />
      {view && <BuildProgress view={view} />}
      {/* 시연 동선(등록 → 빌드 → 승인 → 활성화)의 첫 칸이라 빌드보다 위에 둔다. */}
      {/* onFirstBuild는 버전이 0건일 때만 넘긴다 — 하나라도 있으면 위 「Build 시작」이 그 일을
          하므로 진입점을 둘로 두지 않는다. 조회 중(versions == null)에도 넘기지 않는다:
          곧 사라질 버튼을 먼저 보이면 눌렀다가 없어진다. */}
      <ConnectorPanel
        api={api}
        projectId={target?.kind === 'ready' ? target.projectId : null}
        mayWrite={mayWrite}
        onFirstBuild={canWrite && versions?.length === 0 && view == null ? askFirstBuild : undefined}
        onConnectors={setConnectors}
      />
      <ActivationRequests
        api={api}
        knowledgeBaseId={knowledgeBaseId}
        mayWrite={mayWrite}
        versions={versions}
        refreshKey={requestsKey}
      />
      <VersionTable
        versions={versions}
        mayWrite={mayWrite}
        blocked={target != null && target.kind !== 'ready'}
        busy={busy || !canWrite}
        canRollback={canWrite && previousActive != null}
        onSwitch={askSwitch}
        onRollback={askRollback}
        onDiagnose={canWrite ? setDiagnosing : null}
        diagnosing={diagnosing?.knowledgeVersionId ?? null}
      />
      {diagnosing && knowledgeBaseId && <TourDiagnosisPanel
        api={api}
        knowledgeBaseId={knowledgeBaseId}
        version={diagnosing}
        onClose={() => setDiagnosing(null)}
      />}
    </div>
    {confirmation && <ConfirmDialog
      confirmation={confirmation}
      connectors={connectors}
      busy={busy}
      onCancel={() => { if (!busy) setConfirmation(null) }}
      onConfirm={(picked) => { void runConfirmed(picked) }}
    />}
  </>
}

/**
 * 스케줄러가 센 건수 한 칸. 0은 흐리게 둔다 — 셋 중 실제로 바뀐 것만 눈에 남는다.
 */
function ChangeCount({ label, value }: { label: string; value: number }) {
  return <span className={`inline-flex items-baseline gap-1 ${value === 0 ? 'opacity-45' : ''}`}>
    <b className="text-sm font-bold tabular-nums">{value}</b>
    <span className="text-[0.6875rem]">{label}</span>
  </span>
}

/**
 * 무엇을 모을지 고르는 칸(AI02-027).
 *
 * <p>두 자리의 역할이 다르다. <b>기준 자료</b>는 문서 집합을 만든다 — 여기 없는 문서는
 * 어디에도 없다. <b>추가 자료</b>는 그 문서에 정보를 덧붙인다(축제 행사일처럼 목록이
 * 주지 않는 값). 그래서 기준은 하나만 고르고 추가는 여럿 고를 수 있다.
 *
 * <p>기준으로 고른 것은 추가 목록에서 뺀다 — 같은 자료를 두 번 넣을 이유가 없고,
 * 서버도 중복을 무시한다.
 */
function SourcePicker({ connectors, base, overlays, disabled, onBase, onOverlays }: {
  connectors: Connector[]
  base: string
  overlays: string[]
  disabled: boolean
  onBase: (id: string) => void
  onOverlays: (ids: string[]) => void
}) {
  if (connectors.length === 0) {
    return <p className="mt-3 text-[0.75rem] text-muted-3">쓸 수 있는 자료 출처가 없습니다.</p>
  }
  const extras = connectors.filter((item) => item.connectorVersionId !== base)
  const chosen = overlays.filter((id) => id !== base)
  const toggle = (id: string) => onOverlays(
    chosen.includes(id) ? chosen.filter((kept) => kept !== id) : [...chosen, id])

  return <div className="mt-3 flex flex-col gap-3 border-t border-line-soft pt-3">
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-1 p-0 text-[0.75rem] font-semibold text-ink">어느 자료를 모을까요?</legend>
      <p className="m-0 mb-[0.375rem] text-[0.6875rem] text-muted-3">기준 자료가 문서 목록을 만듭니다.</p>
      <div className="flex flex-col gap-[0.125rem]">
        {connectors.map((item) => <label
          key={item.connectorVersionId}
          className="flex cursor-pointer items-center gap-2 rounded-[0.3125rem] px-1 py-[0.1875rem] text-[0.75rem] text-body hover:bg-sub"
        >
          <input
            type="radio"
            name="build-base-source"
            checked={base === item.connectorVersionId}
            disabled={disabled}
            onChange={() => onBase(item.connectorVersionId)}
          />
          {item.name}
        </label>)}
      </div>
    </fieldset>
    {extras.length > 0 && <fieldset className="m-0 border-0 p-0">
      <legend className="mb-1 p-0 text-[0.75rem] font-semibold text-ink">여기에 더 붙일 자료 (선택)</legend>
      <p className="m-0 mb-[0.375rem] text-[0.6875rem] text-muted-3">
        기준 자료가 모은 문서에 정보를 덧붙입니다. 최대 {MAX_OVERLAYS}개.
      </p>
      <div className="flex flex-col gap-[0.125rem]">
        {extras.map((item) => <label
          key={item.connectorVersionId}
          className="flex cursor-pointer items-center gap-2 rounded-[0.3125rem] px-1 py-[0.1875rem] text-[0.75rem] text-body hover:bg-sub"
        >
          <input
            type="checkbox"
            checked={chosen.includes(item.connectorVersionId)}
            disabled={disabled
              || (!chosen.includes(item.connectorVersionId) && chosen.length >= MAX_OVERLAYS)}
            onChange={() => toggle(item.connectorVersionId)}
          />
          {item.name}
        </label>)}
      </div>
    </fieldset>}
  </div>
}

/**
 * 되돌리기 어려운 쓰기 3종 앞의 확인 창.
 *
 * <p>건수(문서·청크)를 본문에 넣는 것이 핵심이다 — 빈 버전도 오류 없이 활성화되므로
 * (함정 2) 누르기 전에 사람이 눈으로 볼 마지막 지점이 여기다.
 */
function ConfirmDialog({ confirmation, connectors, busy, onCancel, onConfirm }: {
  confirmation: Confirmation
  /** 창이 열린 뒤에 도착할 수 있다. 그래서 스냅숏이 아니라 지금 값을 받는다. */
  connectors: Connector[] | null
  busy: boolean
  onCancel: () => void
  onConfirm: (picked?: BuildSources) => void
}) {
  const pick = confirmation.sources
  // 활성 원천만 쓸 수 있다 — 서버가 ACTIVE가 아닌 커넥터 버전을 거절한다.
  const usable = (connectors ?? []).filter((item) => item.status === 'ACTIVE')
  const [base, setBase] = useState(pick?.base ?? '')
  const [overlays, setOverlays] = useState<string[]>([])
  const picked = pick ? { base, overlays: overlays.filter((id) => id !== base) } : undefined

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
        {pick && <SourcePicker
          connectors={usable}
          base={base}
          overlays={overlays}
          disabled={busy}
          onBase={setBase}
          onOverlays={setOverlays}
        />}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
        <button className={noHover(secondaryButton)} onClick={onCancel} disabled={busy}>취소</button>
        <button
          className={tableButton}
          onClick={() => onConfirm(picked)}
          disabled={busy || (pick != null && base === '')}
        >
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
function Summary({ active, name, loading, blocked, portalPath }: {
  active: KnowledgeVersion | null
  name: string | null
  loading: boolean
  blocked: boolean
  /** 이 고객사의 공개 포털 딥링크(AI02-021). 모르는 고객사는 null — 칸을 그리지 않는다. */
  portalPath: string | null
}) {
  const placeholder = blocked ? '—' : loading ? '조회 중…' : '없음'
  const cells = [
    { label: '활성 버전', value: active ? `v${active.versionNumber}` : placeholder },
    { label: '문서', value: active ? `${active.documentCount}건` : '—' },
    { label: '활성화', value: active?.activatedAt ? new Date(active.activatedAt).toLocaleString('ko-KR') : '—' },
  ]
  return <section className={panel}>
    <PanelTitle title={name ?? '지식 베이스'} sub={active?.label ?? undefined} />
    <div className={`grid sm:grid-cols-2 ${portalPath ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
      {cells.map((cell) => <div key={cell.label} className="border-r border-row-line px-4 py-[0.875rem]">
        <small className="block text-[0.65625rem] text-muted-3">{cell.label}</small>
        <b className="mt-[0.3125rem] block text-[0.78125rem] font-semibold">{cell.value}</b>
      </div>)}
      {portalPath && <div className="border-r border-row-line px-4 py-[0.875rem]">
        <small className="block text-[0.65625rem] text-muted-3">포털 주소</small>
        <a
          className="mt-[0.3125rem] block truncate text-[0.78125rem] font-semibold text-primary underline"
          href={portalPath} target="_blank" rel="noreferrer"
          title="이 고객사의 사용자 포털을 새 탭에서 엽니다."
        >{portalPath.split('?')[0]}</a>
      </div>}
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
    <PanelTitle title="자료 만드는 중" sub={`v${view.version.versionNumber}`}>
      <Badge tone={view.stalled ? 'fail' : 'run'}>{view.stalled ? '정체' : '진행 중'}</Badge>
    </PanelTitle>
    <div className="px-4 pb-4 pt-[0.875rem]">
      <p className="m-0 text-[0.8125rem] font-semibold text-ink">
        자료를 만들고 있습니다 · {formatElapsed(view.elapsedMs)} 경과 <span className="font-normal text-muted-2">(보통 8분쯤)</span>
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
        >{BUILD_STEP_LABEL[step] ?? step}</span>)}
      </div>
      {view.phase == null && <p className="m-0 mt-2 text-[0.6875rem] text-muted-3">
        단계 정보를 읽을 수 없어 진행 여부만 표시합니다.
      </p>}
    </div>
  </section>
}

/**
 * 버전이 받은 평가 결과 한 줄(AI02-019·020·023). 방식에 따라 이름을 가른다 — 제목
 * 자가검색은 "색인이 검색되는가"일 뿐이고 골든 질문은 확정 시험지 기반 품질이다.
 * 한 이름으로 묶으면 관리자가 제목 검색 결과를 품질 검증으로 읽는다.
 *
 * <p>수치는 <b>하나만</b> 보인다. 표에서 읽어야 하는 것은 "이 버전이 몇 점인가"뿐이고,
 * Hit@10·MRR·세트 버전·제외 건수는 판단을 돕지 않으면서 표를 빽빽하게 만든다 —
 * 그 값들은 툴팁에 그대로 남겨 두므로 필요한 사람은 셀에 올려 보면 된다.
 */
function BuildEvaluationCell({ evaluation }: { evaluation: BuildEvaluation }) {
  const golden = evaluation.method === 'GOLDEN_QUESTION'
  const excludedCount = evaluation.excluded?.length ?? 0
  const numbers = `Hit@5 ${evaluation.hit5.toFixed(3)} · Hit@10 ${evaluation.hit10.toFixed(3)}`
    + ` · MRR ${evaluation.mrr10.toFixed(3)}`
  const detail = golden
    ? `확정·동결된 골든 질문 세트 v${evaluation.setVersion ?? 1} · 문항 ${evaluation.sampleSize}로 잰 값입니다.`
      + ` 같은 세트 버전끼리만 비교하세요. ${numbers}.`
      + (excludedCount > 0 ? ` 정답 문서 부재로 채점 전에 제외된 문항 ${excludedCount}건.` : '')
    : `제목으로 검색해 그 문서가 상위에 오는지 잰 값입니다. 표본 ${evaluation.sampleSize}건 ·`
      + ` 사용자 질문 기반 시험지가 아닙니다. ${numbers}.`
  return <b className="text-[0.71875rem] font-semibold text-ink" title={detail}>
    {golden ? '품질 평가' : '색인 검색'} {Math.round(evaluation.hit5 * 100)}%
  </b>
}

/** 평가를 받지 못한 버전은 빈칸이 아니라 "측정 전"이다 — 0점과 구분돼야 한다. */
function MetricsCell({ version }: { version: KnowledgeVersion }) {
  return version.evaluation
    ? <BuildEvaluationCell evaluation={version.evaluation} />
    : <span className="text-[0.6875rem] text-muted-3">측정 전</span>
}

/**
 * 지금 운영에 관계된 버전만 보인다 — 보관은 <b>직전 한 건만</b> 남긴다(AI02-023).
 *
 * <p>여덟 줄을 늘어놓으면 관리자가 "지금 서비스되는 것이 무엇인가"를 한눈에 읽지 못하고,
 * 평가 방식이 서로 다른 옛 줄이 나란히 놓여 성립하지 않는 대조를 만든다. 그렇다고 보관을
 * 전부 감추면 <b>방금 밀려난 버전이 활성화와 동시에 사라진다</b> — 되돌릴 대상이 화면에서
 * 증발하는 셈이라 "잘못 활성화했다"를 알아챈 순간 돌아갈 곳이 안 보인다(2026-09-14 실측).
 * 그래서 마지막으로 활성화됐던 보관 버전 하나는 남긴다. 「이전 버전 롤백」 버튼이 가리키는
 * 바로 그 버전이고, 더 오래된 것은 DB에 남아 있되 목록에서 빠진다.
 *
 * <p><b>실패·빌드 중 버전은 남긴다.</b> 지금 처리해야 할 상태이기 때문이다 — 숨기면 방금
 * 실패한 빌드가 화면에서 조용히 사라져, 관리자가 왜 새 버전이 안 생겼는지 알 길이 없어진다.
 */
function operating(versions: KnowledgeVersion[] | null): KnowledgeVersion[] | null {
  if (versions == null) return null
  const rollbackTarget = previousActiveOf(versions)
  return versions.filter((v) => v.status !== 'ARCHIVED'
    || v.knowledgeVersionId === rollbackTarget?.knowledgeVersionId)
}

/**
 * 이전 활성 버전 = 마지막으로 활성화된 적 있는 보관 버전. 없으면 롤백 대상이 없다.
 * 버전 번호가 아니라 <b>활성화 시각</b>으로 고른다 — 롤백으로 되돌아간 이력이 있으면
 * 번호가 큰 쪽이 더 최근에 서비스된 버전이라는 보장이 없다.
 */
function previousActiveOf(versions: KnowledgeVersion[] | null): KnowledgeVersion | null {
  return (versions ?? [])
    .filter((v) => v.status === 'ARCHIVED' && v.activatedAt)
    .sort((a, b) => (a.activatedAt! < b.activatedAt! ? 1 : -1))[0] ?? null
}

/** A5 버전 테이블. 쓰기 버튼은 역할로 미리 판별해 disabled로 둔다 — 눌러서 403을 받지 않는다. */
function VersionTable({ versions, mayWrite, blocked, busy, canRollback, onSwitch, onRollback, onDiagnose, diagnosing }: {
  versions: KnowledgeVersion[] | null
  mayWrite: boolean
  blocked: boolean
  busy: boolean
  canRollback: boolean
  onSwitch: (version: KnowledgeVersion) => void
  onRollback: () => void
  /** 진단은 로컬 통로(AI02-027)라 쓰기 권한이 없으면 넘어오지 않는다. */
  onDiagnose: ((version: KnowledgeVersion) => void) | null
  diagnosing: string | null
}) {
  const shown = operating(versions)
  const archivedCount = (versions?.length ?? 0) - (shown?.length ?? 0)
  // 전체 100%를 비율로 나눈다 — 지표에 1fr을 주면 남는 폭을 전부 먹어 텅 비어 보인다.
  const columns = 'grid-cols-[8fr_13fr_12fr_28fr_13fr_26fr]'
  return <section className={panel}>
    <PanelTitle
      title="RAG 버전"
      sub={shown ? `운영 ${shown.length}건${archivedCount > 0 ? ` · 보관 ${archivedCount}건` : ''}` : undefined}
    >
      <button
        className={tableButton}
        disabled={busy || !canRollback}
        onClick={onRollback}
        title={!mayWrite ? WRITE_DENIED_HINT : canRollback ? '마지막으로 활성화됐던 버전으로 되돌립니다.' : '되돌릴 이전 활성 버전이 없습니다.'}
      >이전 버전 롤백</button>
    </PanelTitle>
    <div className="overflow-x-auto">
      <div className="min-w-[50rem]">
        <div className={`${headRow} ${columns}`}>
          <span>버전</span><span>상태</span><span>문서</span><span>평가 결과</span><span>활성화</span><span className="text-right">동작</span>
        </div>
        {versions == null && <div className="px-4 py-6 text-xs text-muted-3">
          {blocked ? '위 안내를 해결해야 버전을 불러올 수 있습니다.' : '버전을 불러오는 중…'}
        </div>}
        {shown?.length === 0 && <div className="px-4 py-6 text-xs text-muted-3">
          {archivedCount > 0 ? '운영 중인 버전이 없습니다. 보관된 버전은 롤백으로 되돌릴 수 있습니다.' : '버전이 없습니다.'}
        </div>}
        {shown?.map((version) => <div key={version.knowledgeVersionId} className={`${bodyRow} ${columns}`}>
          <span><b className="text-[0.78125rem] font-semibold text-ink">v{version.versionNumber}</b></span>
          <span><Badge tone={STATUS_TONE[version.status]}>{STATUS_LABEL[version.status]}</Badge></span>
          <span className="font-mono">{version.documentCount}건</span>
          <MetricsCell version={version} />
          <span className="font-mono text-[0.6875rem]">{version.activatedAt ? new Date(version.activatedAt).toLocaleDateString('ko-KR') : '—'}</span>
          <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
            {/* 점수가 있는 버전에만 붙인다 — 측정 전 버전은 설명할 점수가 없다. */}
            {onDiagnose && version.evaluation && <button
              className={tableButton}
              disabled={diagnosing === version.knowledgeVersionId}
              onClick={() => onDiagnose(version)}
              title={`이 점수가 왜 나왔는지 에이전트가 조사합니다 (약 30초).`}
            ><Icon name="search-check" size={12} />원인 분석</button>}
            {version.status === 'ACTIVE'
              ? <small className="text-[0.6875rem] text-ok-fg">현재 활성</small>
              : <button
                className={tableButton}
                disabled={busy || switchPath(version.status) == null}
                onClick={() => onSwitch(version)}
                title={!mayWrite ? WRITE_DENIED_HINT : NOT_SWITCHABLE[version.status] ?? `포털이 v${version.versionNumber} 기준으로 답하게 합니다.`}
              ><Icon name="repeat" size={12} />전환</button>}
          </span>
        </div>)}
      </div>
    </div>
  </section>
}

const headRow = 'bg-sub px-4 py-2 text-[0.6875rem] font-semibold text-muted-2 border-b border-line-soft grid'
const bodyRow = 'grid items-center border-b border-row-line px-4 py-[0.625rem] text-xs text-body'
