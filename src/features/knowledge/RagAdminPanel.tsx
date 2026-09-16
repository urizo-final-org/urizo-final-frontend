import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { portalPathOf } from '../site/portal-projects'
import { describeFailure } from '../../shared/api/error'
import type { AdminRole } from '../../shared/api/session'
import { Badge, Callout, PageHead, PanelTitle, panel, primaryButton, secondaryButton, smallButton, tableButton, type Tone } from '../../shared/ui/primitives'
import { Icon } from '../../shared/ui/icons'
import { ActivationRequests } from './ActivationRequests'
import { ConnectorPanel, PreviewResult, PREVIEW_MAX_ITEMS } from './ConnectorPanel'
import { TourDiagnosisPanel } from './TourDiagnosis'
import { noHover } from './no-hover'
import { KnowledgeAdminApi } from './admin-api'
import type { BuildEvaluation, Connector, ConnectorPreview, KnowledgeBase, KnowledgeTarget, KnowledgeVersion, KnowledgeVersionStatus, AgentJob, Project } from './admin-types'
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

    {/* 프로젝트 선택이 이 화면의 시작점이다. 그래서 어떤 안내보다 위에 둔다 —
        아래 것들은 전부 "고른 프로젝트의 내용"이라, 고르기 전에는 읽을 것이 없다. */}
    {target?.kind === 'empty' && <TargetNotice target={target} />}
    {target != null && target.kind !== 'empty' && <TargetPicker target={target} onPick={pickTarget} />}

    {/* 스케줄러 감지분(AI02-022). 활성 버전 기준 괴리라 갱신(새 버전 활성화) 전까지 남는다.
        <b>고른 프로젝트에 종속된 알림</b>이므로 선택 드롭다운보다 아래에 둔다 — 위에 두면
        시스템 전체 경고처럼 읽힌다.
        최고 관리자는 여기서 바로 만들 수 있다 — 알림을 본 사람과 조치할 수 있는 사람이
        같은데 다른 패널로 보내면, 읽고 나서 할 일을 한 번 더 찾아야 한다(AI02-027). */}
    {/* 위아래 카드와 붙어 있으면 카드의 일부처럼 읽힌다. 독립된 알림 블록으로 보이도록 띄운다. */}
    {changeSummary && <div className="my-5"><Callout tone="warn" icon="triangle-alert">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-bold">원천 데이터가 바뀌었습니다</span>
        <span className="flex items-center gap-2">
          <ChangeCount label="신규" value={changeSummary.added} />
          <ChangeCount label="수정" value={changeSummary.modified} />
          <ChangeCount label="사라짐" value={changeSummary.missing} />
        </span>
        <span className="text-[0.6875rem] opacity-80">
          {new Date(changeSummary.checkedAt).toLocaleString('ko-KR')} 확인 · 활성 v{changeSummary.comparedVersion} 기준
        </span>
        {mayWrite
          ? /* 배너 안에서는 버튼 모양을 쓰지 않는다 — 우측 상단의 같은 동작과 형태가 부딪쳐
               둘 중 무엇을 눌러야 하는지 흐려진다. 문장 옆 링크로 붙인다. */
            <button
              className="font-semibold underline underline-offset-2 enabled:hover:opacity-75 disabled:opacity-45"
              disabled={busy || newest == null || view != null}
              onClick={askBuild}
              title={view != null ? '이미 만드는 중입니다.' : '바뀐 원천으로 검색 자료를 새로 만듭니다 (약 8분).'}
            >지금 새 자료 만들기</button>
          : <span>갱신은 최고 관리자가 합니다. 아래 「갱신 요청」에 남겨 주세요.</span>}
      </span>
    </Callout></div>}
    {/* 이 문장은 원래 아무 데로도 가지 않았다. 이제 아래 요청 패널이 그 경로다. */}
    {!mayWrite && <div className="mb-4"><Callout tone="warn" icon="lock">조회만 가능합니다. {WRITE_DENIED} 아래 「갱신 요청」에 남기면 그대로 전달됩니다.</Callout></div>}
    {failure != null && <div className="mb-4"><Callout tone="warn" icon="triangle-alert">{describeFailure(failure)}</Callout></div>}

    {/* 프로젝트를 고르기 전에는 아래 패널이 전부 빈칸("—")이라 읽을 것이 없다.
        빈 표를 흐리게 깔아 두는 대신 해야 할 일 한 줄만 남긴다. */}
    {target?.kind === 'choose' ? <ProjectGate /> : <div className="flex min-w-0 flex-col gap-[0.875rem]">
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
        // 진단 패널은 열어 둔 채로 확인창만 띄운다 — 취소하면 읽던 진단으로 그대로 돌아온다.
        onRebuild={canWrite && newest != null && view == null ? askBuild : undefined}
      />}
    </div>}
    {confirmation && <ConfirmDialog
      api={api}
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
function SourcePicker({ api, connectors, base, overlays, disabled, onBase, onOverlays }: {
  api: KnowledgeAdminApi
  connectors: Connector[]
  base: string
  overlays: string[]
  disabled: boolean
  onBase: (id: string) => void
  onOverlays: (ids: string[]) => void
}) {
  // 열어 둔 미리보기는 하나다. 같은 원천이 기준·추가 두 목록에 모두 서므로 자리까지 키에 넣는다 —
  // 커넥터 id만 쓰면 한 번 눌렀을 때 두 목록에서 동시에 펼쳐진다.
  const [open, setOpen] = useState<string | null>(null)
  const [preview, setPreview] = useState<ConnectorPreview | null>(null)
  const [previewFailure, setPreviewFailure] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)

  if (connectors.length === 0) {
    return <p className="mt-3 text-[0.75rem] text-muted-3">쓸 수 있는 자료 출처가 없습니다.</p>
  }
  const extras = connectors.filter((item) => item.connectorVersionId !== base)
  const chosen = overlays.filter((id) => id !== base)
  const toggle = (id: string) => onOverlays(
    chosen.includes(id) ? chosen.filter((kept) => kept !== id) : [...chosen, id])

  const look = async (slot: string, connector: Connector) => {
    if (open === slot) { setOpen(null); return }
    setOpen(slot); setPreview(null); setPreviewFailure(null); setLoading(true)
    try { setPreview(await api.previewConnector(connector.connectorId, PREVIEW_MAX_ITEMS)) }
    catch (error) { setPreviewFailure(error) }
    finally { setLoading(false) }
  }

  /**
   * 원천 한 줄. **고르는 자리와 들여다보는 자리를 분리한다** — 미리보기 버튼을 `label`
   * 안에 두면 누를 때마다 라디오·체크박스가 같이 눌린다.
   */
  const option = (item: Connector, slot: string, control: React.ReactNode) => <div
    key={slot}
    className="rounded-[0.3125rem] px-1 py-[0.1875rem] hover:bg-sub"
  >
    <div className="flex items-center gap-2">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[0.75rem] text-body">
        {control}
        <span className="truncate">{item.name}</span>
      </label>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1 rounded-[0.25rem] border border-field-line px-2 py-1 text-[0.6875rem] font-semibold text-muted-2 hover:border-btn-line hover:bg-sub hover:text-ink"
        aria-expanded={open === slot}
        onClick={() => { void look(slot, item) }}
      ><Icon name="search-check" size={11} />{open === slot ? '접기' : '미리보기'}</button>
    </div>
    {open === slot && <SourcePreview
      loading={loading}
      failure={previewFailure}
      result={preview}
    />}
  </div>

  return <div className="mt-3 flex flex-col gap-3 border-t border-line-soft pt-3">
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-1 p-0 text-[0.75rem] font-semibold text-ink">기준 데이터 선택 (필수)</legend>
      <p className="m-0 mb-[0.375rem] text-[0.6875rem] text-muted-3">
        기준 자료가 문서 목록을 만듭니다. 「미리보기」로 그 자료가 실제로 무엇을 주는지 볼 수 있습니다.
      </p>
      <div className="flex flex-col gap-[0.125rem]">
        {connectors.map((item) => option(item, `base:${item.connectorVersionId}`, <input
          type="radio"
          name="build-base-source"
          checked={base === item.connectorVersionId}
          disabled={disabled}
          onChange={() => onBase(item.connectorVersionId)}
        />))}
      </div>
    </fieldset>
    {extras.length > 0 && <fieldset className="m-0 border-0 p-0">
      <legend className="mb-1 p-0 text-[0.75rem] font-semibold text-ink">추가 병합 데이터 (선택)</legend>
      <p className="m-0 mb-[0.375rem] text-[0.6875rem] text-muted-3">
        기준 자료가 모은 문서에 정보를 덧붙입니다. 최대 {MAX_OVERLAYS}개.
      </p>
      <div className="flex flex-col gap-[0.125rem]">
        {extras.map((item) => option(item, `overlay:${item.connectorVersionId}`, <input
          type="checkbox"
          checked={chosen.includes(item.connectorVersionId)}
          disabled={disabled
            || (!chosen.includes(item.connectorVersionId) && chosen.length >= MAX_OVERLAYS)}
          onChange={() => toggle(item.connectorVersionId)}
        />))}
      </div>
    </fieldset>}
  </div>
}

/** 창 안에서 펼치는 미리보기. 결과 카드는 커넥터 패널이 쓰는 것을 그대로 쓴다. */
function SourcePreview({ loading, failure, result }: {
  loading: boolean
  failure: unknown
  result: ConnectorPreview | null
}) {
  if (loading) {
    return <p className="m-0 mt-[0.375rem] flex items-center gap-1.5 text-[0.6875rem] text-muted-3">
      <Icon name="loader-circle" size={12} className="animate-spin" />원천을 불러오는 중입니다…
    </p>
  }
  if (failure != null) {
    return <p className="m-0 mt-[0.375rem] text-[0.6875rem] text-fail-fg">{describeFailure(failure)}</p>
  }
  return result ? <PreviewResult result={result} /> : null
}

/**
 * 되돌리기 어려운 쓰기 3종 앞의 확인 창.
 *
 * <p>건수(문서·청크)를 본문에 넣는 것이 핵심이다 — 빈 버전도 오류 없이 활성화되므로
 * (함정 2) 누르기 전에 사람이 눈으로 볼 마지막 지점이 여기다.
 */
function ConfirmDialog({ api, confirmation, connectors, busy, onCancel, onConfirm }: {
  api: KnowledgeAdminApi
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
    <div className={`${panel} flex max-h-full w-full max-w-[26rem] flex-col`}>
      {/* 미리보기를 펼치면 본문이 길어진다. 창 자체가 화면 밖으로 자라면 「만들기 시작」이
          잘려 보이지 않으므로, 늘어나는 쪽은 본문만이고 버튼 줄은 항상 남는다. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <h2 className="text-[0.875rem] font-semibold text-ink">{confirmation.title}</h2>
        {/* 빌드 확인창(소스를 고르는 창)만 뱃지로 감싼다 — "8분·승인 대기"가 매번 같은 값으로
            반복되니 핵심만 눈에 먼저 들어오게 하고, 문장은 그 아래에 그대로 둔다.
            활성화·롤백처럼 소스를 안 고르는 확인창은 원래의 담백한 목록 그대로 둔다. */}
        {pick ? <div className="mt-2 flex flex-col gap-2 rounded-[0.375rem] border border-line-soft bg-sub px-3 py-[0.625rem]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-[0.125rem] text-[0.625rem] font-semibold text-muted-2">
              <Icon name="timer" size={11} />약 8분 소요
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-[0.125rem] text-[0.625rem] font-semibold text-muted-2">
              <Icon name="inbox" size={11} />승인 대기로 시작
            </span>
          </div>
          <ul className="m-0 flex flex-col gap-1 p-0">
            {confirmation.lines.map((line) => <li key={line} className="text-[0.75rem] text-muted-2">{line}</li>)}
          </ul>
        </div> : <ul className="mt-2 flex flex-col gap-1">
          {confirmation.lines.map((line) => <li key={line} className="text-[0.75rem] text-muted-2">{line}</li>)}
        </ul>}
        {pick && <SourcePicker
          api={api}
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
        {/* 되돌리기 어려운 쓰기를 실제로 시작하는 단 하나의 버튼이다 — 이 창에서 가장 눈에
            띄어야 한다. */}
        <button
          className={primaryButton}
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
 * 프로젝트를 고르기 전에는 아래가 전부 잠겨 있다는 것만 말한다.
 *
 * <p>예전에는 빈 표를 그대로 두고 "위 안내를 해결해야 버전을 불러올 수 있습니다"라고 했다.
 * 어떤 안내인지 화면 어디에도 없어서, 사용자가 원인을 네트워크나 권한에서 찾았다.
 */
function ProjectGate() {
  return <section className={`${panel} px-4 py-12`}>
    <div className="mx-auto flex max-w-[26rem] flex-col items-center gap-[0.625rem] text-center">
      <span aria-hidden className="text-2xl">📁</span>
      <b className="break-keep text-[0.875rem] font-semibold text-ink">
        버전 내역을 확인하려면 상단에서 프로젝트를 먼저 선택해 주세요.
      </b>
      <p className="m-0 flex items-center gap-1.5 break-keep text-[0.75rem] text-muted-3">
        <Icon name="lock" size={12} className="shrink-0" />
        지식 베이스 · 자료 출처 · 버전 목록은 프로젝트 선택 시 활성화됩니다.
      </p>
    </div>
  </section>
}

/**
 * 후보가 여럿일 때만 드롭다운을 그린다. 1건이면 자동 선택돼 여기 오지 않는다.
 *
 * <p><b>툴바로 둔다.</b> 이 화면 전체가 "고른 프로젝트의 내용"이므로, 일반 입력 폼처럼
 * 본문 중간에 끼면 한 번 고르고 마는 값처럼 보인다. 회색 바로 묶어 페이지 머리에 붙인다.
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

  return <section className={`${panel} bg-sub`}>
    <div className="flex flex-wrap items-end gap-5 px-6 py-5">
      {needsProject && <Field
        label="프로젝트"
        value={target.project?.projectId ?? ''}
        required={target.project == null}
        options={projects.map((item) => ({ id: item.projectId, name: item.name }))}
        onPick={(id) => onPick('project', id)}
      />}
      {needsBase && <Field
        label="지식 베이스"
        value={target.kind === 'ready' ? target.knowledgeBaseId : ''}
        required={target.kind !== 'ready'}
        options={bases.map((item) => ({ id: item.knowledgeBaseId, name: item.name }))}
        onPick={(id) => onPick('knowledgeBase', id)}
      />}
    </div>
  </section>
}

function Field({ label, value, options, onPick, required }: {
  label: string
  value: string
  options: { id: string; name: string }[]
  onPick: (id: string) => void
  /** 아직 안 고른 칸. 테두리와 뱃지로 "여기부터"라고 말한다. */
  required: boolean
}) {
  // 뱃지를 label 안에 두면 접근 이름이 "프로젝트필수"가 되어 낭독기와 테스트가 칸을 못 찾는다.
  // 그래서 뱃지는 label 밖 형제로 두고 htmlFor로 묶는다.
  const id = useId()
  return <div className="flex flex-col gap-3 text-[0.75rem] text-muted-3">
    <span className="flex items-center gap-2">
      <label htmlFor={id} className="font-semibold">{label}</label>
      {required && <span className="rounded-full bg-primary px-[0.4375rem] py-[0.0625rem] text-[0.625rem] font-semibold text-white">필수</span>}
    </span>
    <select
      id={id}
      value={value}
      aria-required={required}
      onChange={(event) => onPick(event.target.value)}
      className={`h-11 min-w-[16rem] rounded-[0.375rem] border bg-white px-4 text-[0.8125rem] text-ink ${
        required ? 'border-primary shadow-[0_0_0_3px_#1733551f]' : 'border-field-line'}`}
    >
      <option value="" disabled>작업할 {label}를 선택해 주세요</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select>
  </div>
}

/** 루트 포털("/")은 그대로 쓰면 값이 비어 보인다 — 무엇인지 한 마디 붙인다. */
function portalLabel(portalPath: string): string {
  const path = portalPath.split('?')[0]
  return path === '/' ? '/ (메인)' : path
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
    {/* 제목에 프로젝트 이름을 다시 쓰지 않는다 — 바로 위 드롭다운이 이미 말하고 있어서
        같은 이름이 두 번 나오면(중기부처럼 KB 이름이 같을 때) 화면이 겹쳐 읽힌다. */}
    <PanelTitle title="현재 활성 지식 베이스" sub={name ?? undefined} />
    <div className={`grid sm:grid-cols-2 ${portalPath ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
      {cells.map((cell) => <div key={cell.label} className="border-r border-row-line px-4 py-[0.875rem]">
        <small className="block text-[0.65625rem] text-muted-3">{cell.label}</small>
        {/* 이 화면에서 가장 먼저 읽혀야 할 값이다. 표의 한 칸이 아니라 숫자로 보이게 키운다. */}
        <b className="mt-[0.3125rem] block truncate text-[1.0625rem] font-bold tabular-nums leading-tight text-ink">{cell.value}</b>
      </div>)}
      {portalPath && <div className="border-r border-row-line px-4 py-[0.875rem]">
        <small className="block text-[0.65625rem] text-muted-3">포털 주소</small>
        {/* 루트 포털은 경로가 "/" 한 글자뿐이라 값이 빠진 것처럼 보이고 클릭할 곳도 없다.
            무엇인지 덧붙이고, 새 창으로 열린다는 것을 화살표로 알린다. */}
        <a
          className="mt-[0.3125rem] inline-flex max-w-full items-center gap-1 truncate text-[1.0625rem] font-bold leading-tight text-primary hover:underline"
          href={portalPath} target="_blank" rel="noreferrer"
          title="이 고객사의 사용자 포털을 새 탭에서 엽니다."
        >
          <span className="truncate">{portalLabel(portalPath)}</span>
          <Icon name="arrow-up-right" size={14} className="shrink-0" />
        </a>
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
 * 운영 중인 것과 보관된 것으로 나눈다. <b>보관을 목록에서 빼지는 않는다.</b>
 *
 * <p>예전에는 보관을 직전 한 건만 남기고 접었다. 한눈에 읽히기는 했지만 대가가 컸다 —
 * 지나간 버전이 화면에서 아예 사라져, 그 버전이 왜 그 점수였는지 물어볼 수도(「원인 분석」),
 * 무엇으로 만들어졌는지 확인할 수도 없었다. 실제로 「빈약한 출처」로 만들어진 버전을
 * 화면에서 찾지 못해 API를 직접 불러야 했다(2026-09-16 실측).
 *
 * <p>그래서 감추는 대신 <b>구획을 나눈다</b>. 운영 줄이 위에 모여 "지금 서비스되는 것"은
 * 그대로 한눈에 읽히고, 보관은 그 아래 제 구획에서 계속 보인다. 평가 방식이 다른 줄이
 * 섞여 보이는 문제는 숨김이 아니라 구분선과 안내 문구로 푼다.
 */
function groupVersions(versions: KnowledgeVersion[] | null) {
  if (versions == null) return null
  return {
    live: versions.filter((v) => v.status !== 'ARCHIVED'),
    // 보관은 활성화됐던 순서로 — 가장 최근에 서비스된 것이 위에 온다.
    archived: versions.filter((v) => v.status === 'ARCHIVED')
      .sort((a, b) => (a.activatedAt ?? '') < (b.activatedAt ?? '') ? 1 : -1),
    rollbackTargetId: previousActiveOf(versions)?.knowledgeVersionId ?? null,
  }
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
  const groups = groupVersions(versions)
  // 전체 100%를 비율로 나눈다 — 지표에 1fr을 주면 남는 폭을 전부 먹어 텅 비어 보인다.
  const columns = 'grid-cols-[8fr_13fr_12fr_28fr_13fr_26fr]'
  const rollbackTarget = groups?.archived.find(
    (item) => item.knowledgeVersionId === groups.rollbackTargetId) ?? null

  const row = (version: KnowledgeVersion) => <div
    key={version.knowledgeVersionId}
    className={`${bodyRow} ${columns}`}
  >
    <span className="flex items-baseline gap-1.5">
      <b className="text-[0.78125rem] font-semibold text-ink">v{version.versionNumber}</b>
    </span>
    <span><Badge tone={STATUS_TONE[version.status]}>{STATUS_LABEL[version.status]}</Badge></span>
    <span className="font-mono">{version.documentCount}건</span>
    <MetricsCell version={version} />
    <span className="font-mono text-[0.6875rem]">{version.activatedAt ? new Date(version.activatedAt).toLocaleDateString('ko-KR') : '—'}</span>
    <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
      {/* 점수가 있는 버전에만 붙인다 — 측정 전 버전은 설명할 점수가 없다.
          조사는 읽는 동작이라 보조(회색), 전환은 포털 답이 바뀌는 동작이라 주(primary)로 갈라 둔다. */}
      {onDiagnose && version.evaluation && <button
        className={secondaryButton}
        disabled={diagnosing === version.knowledgeVersionId}
        onClick={() => onDiagnose(version)}
        title={`이 점수가 왜 나왔는지 에이전트가 조사합니다 (약 30초).`}
      ><Icon name="search-check" size={12} />AI 분석 보기</button>}
      {/* 두 줄의 높이·모양을 맞춘다 — 활성 줄만 글씨였을 때 표가 한 칸 어긋나 보였다.
          활성은 누를 것이 없으므로 버튼 모양이되 꺼진 상태로 둔다. */}
      {/* secondaryButton을 그대로 펼치고 색만 덮어씌우면 bg-field/text-strong과 특정도가
          같아 스타일시트 선언 순서에 운을 맡기게 된다(실측: 글자색이 회색으로 나옴).
          겹치는 속성이 없는 클래스만 새로 쓴다. */}
      {version.status === 'ACTIVE'
        ? <span className="inline-flex h-8 cursor-default items-center gap-[0.375rem] rounded-[0.3125rem] border border-ok-fg/30 bg-ok-bg px-[0.6875rem] text-xs font-semibold text-ok-fg">
          <Icon name="check" size={12} />현재 활성
        </span>
        : <button
          className={primaryButton}
          disabled={busy || switchPath(version.status) == null}
          onClick={() => onSwitch(version)}
          title={!mayWrite ? WRITE_DENIED_HINT : NOT_SWITCHABLE[version.status] ?? `포털이 v${version.versionNumber} 기준으로 답하게 합니다.`}
        ><Icon name="repeat" size={12} />전환</button>}
    </span>
  </div>

  return <section className={panel}>
    <PanelTitle
      title="RAG 버전"
      sub={groups ? `운영 ${groups.live.length}건${groups.archived.length > 0 ? ` · 보관 ${groups.archived.length}건` : ''}` : undefined}
    >
      {/* 사고가 났을 때 표에서 줄을 찾지 않고 한 번에 되돌리는 자리라 남긴다(복구까지 10초).
          어느 버전으로 가는지는 이름 대신 tooltip과 확인창이 말한다 — 제목줄이 길어지면
          버튼이 문장처럼 읽혀 누를 수 있는 것으로 안 보인다. */}
      <button
        className={secondaryButton}
        disabled={busy || !canRollback}
        onClick={onRollback}
        title={!mayWrite ? WRITE_DENIED_HINT
          : rollbackTarget ? `직전 활성 버전(v${rollbackTarget.versionNumber})으로 되돌립니다.`
            : '되돌릴 이전 활성 버전이 없습니다.'}
      ><Icon name="repeat" size={12} />이전 버전으로 롤백</button>
    </PanelTitle>
    <div className="overflow-x-auto">
      <div className="min-w-[50rem]">
        <div className={`${headRow} ${columns}`}>
          <span>버전</span><span>상태</span><span>문서</span><span>평가 결과</span><span>활성화</span><span className="text-right">동작</span>
        </div>
        {versions == null && <div className="px-4 py-6 text-xs text-muted-3">
          {blocked ? '버전 내역을 확인하려면 상단에서 프로젝트를 먼저 선택해 주세요.' : '버전을 불러오는 중…'}
        </div>}
        {groups?.live.length === 0 && groups.archived.length === 0 && <div className="px-4 py-6 text-xs text-muted-3">
          버전이 없습니다.
        </div>}
        {groups?.live.map(row)}
        {/* 보관은 접지 않고 제 구획에서 계속 보인다. 평가 방식이 다른 줄이 나란히 놓이므로
            숫자를 가로로 비교하지 말라는 것을 구분선에서 한 번 말해 둔다. */}
        {groups != null && groups.archived.length > 0 && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-y border-line bg-sub px-4 py-[0.5625rem]">
          <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[.04em] text-muted-2">
            <Icon name="lock" size={11} className="shrink-0 opacity-70" />보관 {groups.archived.length}건
          </span>
          <span className="break-keep text-[0.6875rem] text-muted-3">
            지난 버전입니다. 같은 질문 세트로 잰 값끼리만 비교할 수 있습니다.
          </span>
        </div>}
        {groups?.archived.map(row)}
      </div>
    </div>
  </section>
}

const headRow = 'bg-sub px-4 py-2 text-[0.6875rem] font-semibold text-muted-2 border-b border-line-soft grid'
const bodyRow = 'grid items-center border-b border-row-line px-4 py-[0.625rem] text-xs text-body'
