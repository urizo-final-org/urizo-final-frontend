import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { describeFailure } from '../../shared/api/error'
import { ROLE_LABELS, type AdminRole } from '../../shared/api/session'
import {
  Badge, Callout, PageHead, PanelTitle, dangerButton, fieldLabel, panel, primaryButton,
  secondaryButton, textarea, type Tone,
} from '../../shared/ui/primitives'
import { Icon } from '../../shared/ui/icons'
import type {
  ApprovalDecision, ApprovalStage, CodingConsoleApiClient, CodingJobStatus, CodingNotification,
  CodingRepository, Handover, JobDetail, JobSummary, PendingApproval, RunnerStatus,
} from './api'
import { diffLines } from './diffLines'
import { lastSeenAt, markSeen, notificationSentence, sinceLabel, unseen } from './notifications'

/**
 * E1, the request screen.
 *
 * One card does two jobs. With nothing in flight it is the form a general administrator types
 * a Korean sentence into; once a request is open it becomes that request. Splitting them into
 * two screens would ask the administrator to know which one to open, and the answer is always
 * "whichever matches the state the server is already reporting".
 *
 * Approval controls belong to the later screens; this one only starts work and shows that it
 * started.
 */

const statusPresentation: Record<CodingJobStatus, { label: string; tone: Tone }> = {
  PENDING: { label: '접수됨 · 시작 대기', tone: 'wait' },
  RUNNING: { label: '진행 중', tone: 'run' },
  WAITING_APPROVAL: { label: '승인 대기', tone: 'wait' },
  COMPLETED: { label: '완료', tone: 'ok' },
  FAILED: { label: '실패', tone: 'fail' },
  CANCELLED: { label: '취소됨', tone: 'idle' },
  EXPIRED: { label: '만료됨', tone: 'idle' },
}

/**
 * Everything after the preview. They are three separate gates, not one screen with three
 * buttons: approving the code does not deploy it, because CMS and DEPLOY are their own
 * approvals further down the graph.
 */
const finalStages: ApprovalStage[] = ['GITHUB', 'CMS', 'DEPLOY']

const finalStageCopy: Record<string, { title: string; sub: string; approve: string }> = {
  GITHUB: {
    title: '코드 승인',
    sub: '승인하면 AI 가 쓴 코드가 반영 절차로 넘어갑니다',
    approve: '네, 이 코드를 반영합니다',
  },
  CMS: {
    title: 'CMS 반영 승인',
    sub: '승인하면 변경이 CMS 에 반영됩니다',
    approve: '네, CMS 에 반영합니다',
  },
  DEPLOY: {
    title: '배포 승인',
    sub: '마지막 관문입니다. 승인하면 배포 요청이 기록됩니다',
    approve: '네, 배포합니다',
  },
}

/**
 * Mirrors the server's `requireRole`: a SUPER_ADMIN stage admits only SUPER_ADMIN, a GENERAL_ADMIN
 * stage admits both administrators. This decides nothing — the server checks again and is the only
 * authority. It exists so the screen can say why a button is locked instead of letting the operator
 * discover it as a 403 on the last gate of a demo.
 */
function canDecide(role: AdminRole, requiredRole: string): boolean {
  if (requiredRole === 'SUPER_ADMIN') return role === 'SUPER_ADMIN'
  if (requiredRole === 'GENERAL_ADMIN') return role === 'SUPER_ADMIN' || role === 'GENERAL_ADMIN'
  return false
}

/** A Job in any other status is finished, and a finished Job is not shown as in flight. */
const openStatuses: CodingJobStatus[] = ['PENDING', 'RUNNING', 'WAITING_APPROVAL']

/**
 * What the administrator is supposed to do next. A status badge says what the server thinks;
 * it does not say whether the person reading it is being waited on, and that is the only
 * question they actually have.
 */
const nextStep: Partial<Record<CodingJobStatus, string>> = {
  PENDING: '차례를 기다리는 중입니다. 진행되면 이 화면이 저절로 바뀝니다.',
  RUNNING: 'AI 가 작업하는 중입니다. 진행되면 이 화면이 저절로 바뀝니다.',
  WAITING_APPROVAL: '아래에서 내용을 확인하고 승인해 주세요.',
}

/**
 * The screen no longer asks which side a sentence is about. That question has no answer the
 * writer can know - "가입일도 보이게 해줘" needs both sides - so the server's classifier reads
 * the sentence instead. These labels remain for display only, on rows that already know.
 */
const repositoryLabels: Record<CodingRepository, string> = {
  backend: '기능과 데이터',
  frontend: '화면 모양',
}

/**
 * The second part of a both-sides request, waiting for the first to finish.
 *
 * <p>Kept in localStorage so a closed tab does not silently orphan the second half - the
 * person was told it would follow, and a promise that survives only in memory is not one.
 */
const SPLIT_PENDING_KEY = 'axms-coding-split-second'

interface PendingSecond {
  firstJobId: string
  firstText: string
  secondText: string
}

function readPendingSecond(): PendingSecond | null {
  try {
    const raw = window.localStorage.getItem(SPLIT_PENDING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingSecond
    return parsed.firstJobId && parsed.secondText ? parsed : null
  }
  catch { return null }
}

function writePendingSecond(value: PendingSecond | null) {
  try {
    if (value) window.localStorage.setItem(SPLIT_PENDING_KEY, JSON.stringify(value))
    else window.localStorage.removeItem(SPLIT_PENDING_KEY)
  }
  catch { /* a browser that refuses storage still gets the current session's chain */ }
}

function repositoryLabel(id: string): string {
  // The list arrives from the server, so the value is a string until it is checked. Narrowing
  // here rather than widening the table keeps the table itself exhaustive: a third repository
  // would have to be named in it before it could be labelled at all.
  return id === 'backend' || id === 'frontend' ? repositoryLabels[id] : id
}

/**
 * E7, the handover record (guide 7-8).
 *
 * <p>The model was given a fixed number of tries and used them all. What it left behind is a
 * round-by-round account of what it built and what the review said was still wrong, which is
 * the whole reason the last refusal ends the Job normally instead of as an error.
 *
 * <p>No code here on purpose. The reviewer's words are already written for someone who cannot
 * read a diff, and the person deciding what to do with an abandoned request is often not the
 * person who will write the fix. The patch itself stays on the super administrator's screen.
 */
function HandoverRecord({ handover }: { handover: Handover }) {
  return <div className="mt-[0.875rem]">
    <b className={`${fieldLabel} block`}>AI 가 시도한 기록 {handover.rounds}회</b>
    <ol className="mt-[0.375rem] space-y-2">
      {handover.attempts.map((attempt) => <li
        key={attempt.round}
        className="rounded-md border border-line p-[0.625rem]"
      >
        <div className="flex items-center justify-between gap-2">
          <b className="text-[0.8125rem] text-body">{attempt.round}번째 시도</b>
          <Badge tone={attempt.accepted ? 'ok' : 'fail'}>
            {attempt.accepted ? '검토 통과' : '검토가 보완을 요구함'}
          </Badge>
        </div>
        {attempt.summary && <p className="mt-[0.375rem] text-[0.8125rem] leading-[1.6] text-body">
          {attempt.summary}
        </p>}
        {attempt.criteriaResults.length > 0 && <ul className="mt-[0.375rem] space-y-1">
          {attempt.criteriaResults.map((result) => <li
            key={result.criterion}
            className="flex items-start gap-2 text-[0.75rem] leading-5 text-muted"
          >
            <span className="flex-1">{result.criterion}</span>
            <Badge tone={result.met === true ? 'ok' : result.met === false ? 'fail' : 'idle'}>
              {result.met === true ? '충족' : result.met === false ? '미충족' : '판정 없음'}
            </Badge>
          </li>)}
        </ul>}
      </li>)}
    </ol>
  </div>
}

function openJob(items: JobSummary[]): JobSummary | null {
  return items.find((item) => openStatuses.includes(item.status)) ?? null
}

/**
 * The screen refreshes itself on the bell's cadence, so a request that finishes or starts
 * waiting for approval shows up without the administrator hammering the refresh button.
 */
const POLL_INTERVAL_MS = 15_000

/** "몇 분째 돌고 있나"를 사람 단위로. 초 단위 정밀함은 여기서 아무것도 결정하지 않는다. */
function elapsedLabel(fromIso: string, toIso: string | undefined, nowMs: number): string {
  const from = Date.parse(fromIso)
  const to = toIso ? Date.parse(toIso) : nowMs
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return ''
  const minutes = Math.floor((to - from) / 60_000)
  if (minutes < 1) return '1분 미만'
  if (minutes < 60) return `${minutes}분`
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`
}

/**
 * Why a job stopped, said for the person who asked for it. The guardrail refusals carry their
 * own next step — the fence is opened by a super administrator, and without that sentence the
 * general administrator has no way to know who to ask.
 */
const failureReasons: Record<string, string> = {
  CODING_GUARDRAIL_PATH_NOT_SELECTED:
    '허용되지 않은 폴더의 파일을 변경해서 중단됐습니다. 이 작업이 꼭 필요하면 최고관리자에게 울타리 설정(허용 폴더 추가)을 요청해 주세요.',
  CODING_GUARDRAIL_PATH_DENIED:
    '고정 금지 구역(로그인·DB 구조 등)의 파일을 변경해서 중단됐습니다. 이 구역은 설정으로도 열 수 없습니다.',
  CODING_GUARDRAIL_RULE_DENIED:
    '부가 규칙(새 라이브러리 금지 또는 변경 크기 상한)을 넘어서 중단됐습니다.',
  /* "요청을 작게 나눠 보세요" was wrong advice: the recorded failures were small requests the
   * AI wandered through, not big ones. Blaming the writer's request teaches the wrong lesson. */
  MODEL_RESPONSE_INVALID:
    'AI가 정해진 횟수 안에 작업을 마치지 못해 중단됐습니다. 요청이 잘못된 것은 아니니 같은 내용으로 다시 시도해 주세요. 반복해서 실패하면 시스템 운영 담당자에게 알려 주세요.',
  /* Not a failure of the request: the AI looked and the change was already there. Calling
   * that "실패" sends the writer off to fix a request that was fine. */
  CODING_DIFF_EMPTY:
    '요청하신 내용이 이미 되어 있어서 바꿀 것이 없었습니다. AI가 관련 파일을 확인했고 고칠 부분을 찾지 못했습니다.',
  /* The other empty ending, and the opposite news: the AI knew what to change and could not
   * land it. Saying "이미 되어 있다" here would be a lie the person acts on. */
  CODING_PATCH_NOT_APPLIED:
    'AI가 고칠 곳은 찾았지만 수정을 반영하지 못했습니다. 요청이 잘못된 것은 아닙니다. 같은 내용으로 다시 시도해 보시고, 반복해서 실패하면 시스템 운영 담당자에게 알려 주세요.',
}

/** "할 일이 없었다"는 실패가 아니다. 뒤따르는 작업은 계속 진행한다. */
const NOTHING_TO_CHANGE = 'CODING_DIFF_EMPTY'

function failureReason(code?: string): string {
  if (code && failureReasons[code]) return failureReasons[code]
  return code
    ? `요청을 완료하지 못했습니다. (코드: ${code})`
    : '요청을 완료하지 못했습니다.'
}

export default function CodingWorkspace({ api, role, monitoringAction }: { api: CodingConsoleApiClient; role: AdminRole; monitoringAction?: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [current, setCurrent] = useState<JobSummary | null>(null)
  /* The most recent request when it failed and nothing newer is running. Without it a failed
   * job simply left this list of open statuses and vanished, which read as "my request
   * disappeared" rather than "my request was stopped, and here is why". */
  const [lastFailed, setLastFailed] = useState<JobSummary | null>(null)
  const [detail, setDetail] = useState<JobDetail | null>(null)
  const [requestText, setRequestText] = useState('')
  const [pendingSecond, setPendingSecond] = useState<PendingSecond | null>(
    () => readPendingSecond())
  const [continuedAfterNothing, setContinuedAfterNothing] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  /* silent marks the automatic ticks: they update the data but never blank the screen with
   * "불러오는 중", which every 15 seconds would read as the page breaking. */
  const [reload, setReload] = useState({ token: 0, silent: false })
  const [history, setHistory] = useState<JobSummary[]>([])
  const [runner, setRunner] = useState<RunnerStatus | null>(null)
  const [notifications, setNotifications] = useState<CodingNotification[]>([])
  const [refusedReason, setRefusedReason] = useState<string | null>(null)
  const [handover, setHandover] = useState<Handover | null>(null)
  /* Captured once, at mount. The screen marks the news read on every tick so the bell clears,
   * so measuring against the live mark would empty this panel fifteen seconds after it filled.
   * Held still, it shows what was new when the reader arrived, plus whatever arrives while
   * they watch - and starts empty next time they come back. */
  const [seenBeforeOpening] = useState(() => lastSeenAt())
  const [nowMs, setNowMs] = useState(() => Date.now())

  /**
   * The list says which request is open; the detail says what it is waiting for. Two calls
   * rather than one fat list, because only the opened request needs the plan and the
   * approval evidence.
   */
  useEffect(() => {
    let active = true
    if (!reload.silent) {
      setLoading(true)
      setFailure(null)
    }
    void (async () => {
      let open: JobSummary | null = null
      let newest: JobSummary | null = null
      let listed: JobSummary[] = []
      try {
        const items = (await api.listJobs()).items
        listed = items
        open = openJob(items)
        newest = items[0] ?? null
        if (active) setHistory(items)
      }
      catch (error: unknown) {
        // A failed automatic tick keeps the last known screen; a wrong blank is worse.
        if (active && !reload.silent) {
          setCurrent(null)
          setDetail(null)
          setFailure(describeFailure(error))
          setLoading(false)
        }
        return
      }
      if (!active) return
      setNowMs(Date.now())
      setCurrent(open)
      // The newest request answers for itself. It used to be shown only when nothing else
      // was open, so a request refused seconds ago stayed invisible behind an approval left
      // waiting from an hour before - which reads as "the guardrail did not refuse it".
      // A refusal also ends the pipeline as an ordinary success, so status alone would file
      // it under "완료" and say nothing at all.
      // A handover ends the pipeline the same way a refusal does, and would otherwise be
      // filed under "완료" - the one ending where somebody actually has to pick the work up.
      setLastFailed(newest && (newest.status === 'FAILED' || newest.refused === true
        || newest.handedOver === true)
        ? newest : null)
      if (!open) setDetail(null)
      if (open) {
        try {
          const loaded = await api.getJob(open.jobId)
          if (active) setDetail(loaded ?? null)
        }
        catch (error: unknown) {
          if (active && !reload.silent) setFailure(describeFailure(error))
        }
      }
      // The refusal's reason is the analyst's own sentence, and it lives in that request's
      // detail - not in the detail of whatever else happens to be open.
      if (newest?.refused) {
        try {
          const refusedDetail = await api.getJob(newest.jobId)
          if (active) setRefusedReason(refusedDetail?.plan?.summary ?? null)
        }
        catch { /* the card falls back to its own sentence */ }
      }
      else if (active) {
        setRefusedReason(null)
      }
      // Same reasoning as the refusal above: the record belongs to the abandoned request, not
      // to whatever else happens to be open.
      if (newest?.handedOver) {
        try {
          const handedOverDetail = await api.getJob(newest.jobId)
          if (active) setHandover(handedOverDetail?.handover ?? null)
        }
        catch { /* the card still says the request was handed over */ }
      }
      else if (active) {
        setHandover(null)
      }
      // The second half of a split waits for the first Job to end well. Read from storage
      // rather than state: the tick closure can hold a stale copy, and a double-send is the
      // failure this record exists to prevent - it is cleared before the call, not after.
      const pending = readPendingSecond()
      if (pending) {
        const first = listed.find((item) => item.jobId === pending.firstJobId)
        if (first && !openStatuses.includes(first.status)) {
          writePendingSecond(null)
          if (active) setPendingSecond(null)
          // A first leg that changed nothing still cleared the way for the second: the data
          // the screen needs was already there. Measured on Job b4c9a477, where the server
          // half ended CODING_DIFF_EMPTY and the screen half was dropped without a word.
          const firstLegCleared = first.status === 'COMPLETED'
            || first.failureCode === NOTHING_TO_CHANGE
          if (firstLegCleared && !first.refused && !first.handedOver) {
            try {
              // The classifier decided the order: data first, screen second. This leg's side
              // is therefore already known, and the server is told rather than asked again.
              const second = await api.createJob('frontend', pending.secondText)
              if (active) {
                // Which leg found nothing, so its card can say what happened next. Without
                // it the person reads "이미 되어 있어 바꿀 것이 없었습니다" and then watches
                // a new job start, with nothing on screen tying the two together.
                setContinuedAfterNothing(
                  first.failureCode === NOTHING_TO_CHANGE ? pending.firstJobId : null)
                setCurrent({
                  jobId: second.created.job.jobId,
                  repository: 'frontend',
                  requestText: second.created.request.requestText,
                  status: second.created.job.status,
                  createdAt: second.created.request.createdAt,
                })
                setDetail(null)
              }
            }
            catch (error: unknown) {
              // The person was promised a second part; a silent drop breaks that promise.
              if (active) setFailure(describeFailure(error))
            }
          }
          // Any other ending: the person is already looking at why the first half stopped.
          // Quietly building the screen half on top of a failed data half helps nobody.
        }
      }
      if (active && !reload.silent) setLoading(false)
      // The runner warning rides the same tick. A failed read keeps the last known verdict
      // rather than flickering between "off" and "on".
      try {
        const status = await api.runnerStatus()
        if (active) setRunner(status)
      }
      catch { /* keep the last known status */ }
      try {
        const feed = await api.notifications()
        if (active) {
          setNotifications(feed.items)
          // Reading this screen is reading the news; the list is on it. Marking here as
          // well as on the bell keeps the badge from counting what is already in view.
          markSeen()
        }
      }
      catch { /* keep the last known feed */ }
    })()
    return () => { active = false }
  }, [api, reload])

  /** F6: the automatic tick. A hidden tab is not being read, so it is not polled. */
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden || submitting || deciding) return
      setReload((prev) => ({ token: prev.token + 1, silent: true }))
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [submitting, deciding])

  /**
   * The screen returns the pendingApproval it was handed. approvalId is a deterministic hash
   * of the stage and round, so recomputing it here would be guessing at the server's own
   * bookkeeping.
   */
  async function decide(pending: PendingApproval, decision: ApprovalDecision, feedback?: string) {
    if (!current || deciding) return
    setDeciding(true)
    setFailure(null)
    try {
      await api.decideApproval(current.jobId, pending, decision, feedback)
      setReload((prev) => ({ token: prev.token + 1, silent: false }))
    }
    catch (error: unknown) {
      setFailure(describeFailure(error))
    }
    finally {
      setDeciding(false)
    }
  }

  /**
   * Calling the request off entirely, which rejecting does not do: a rejection at the preview
   * stage opens the next attempt. Someone who has changed their mind had to reject three times
   * and sit through a model run between each, so this ends it in one step.
   */
  async function cancel() {
    if (!current || cancelling) return
    setCancelling(true)
    setFailure(null)
    try {
      await api.cancelJob(current.jobId)
      setReload((prev) => ({ token: prev.token + 1, silent: false }))
    }
    catch (error: unknown) {
      setFailure(describeFailure(error))
    }
    finally {
      setCancelling(false)
    }
  }

  /**
   * The server asks the runner for a real base commit before it answers, so this takes a
   * couple of seconds. The button says so rather than appearing to have missed the click.
   */
  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = requestText.trim()
    if (text === '' || submitting) return
    setSubmitting(true)
    setFailure(null)
    try {
      // repository null: the server reads the sentence. Which side it is about is not a
      // question the writer can answer, so this screen stopped asking it.
      const outcome = await api.createJob(null, text)
      setDetail(null)
      setLastFailed(null)
      setCurrent({
        jobId: outcome.created.job.jobId,
        repository: '',
        requestText: outcome.created.request.requestText,
        status: outcome.created.job.status,
        createdAt: outcome.created.request.createdAt,
      })
      if (outcome.split) {
        // A both-sides sentence: the data part is already running. Remember the screen part
        // and send it when the first finishes - the person was told it would follow.
        const pending = {
          firstJobId: outcome.created.job.jobId,
          firstText: outcome.split.firstText,
          secondText: outcome.split.secondText,
        }
        setPendingSecond(pending)
        writePendingSecond(pending)
      }
      setRequestText('')
    }
    catch (error: unknown) {
      setFailure(describeFailure(error))
    }
    finally {
      setSubmitting(false)
    }
  }

  // The summary row reads only what the tick already fetched. It adds no request of its own.
  const recent = history.slice(0, 8)
  const recentDone = recent.filter((job) => job.status === 'COMPLETED' && !job.refused && !job.handedOver).length
  const recentStopped = recent.filter((job) => job.refused || job.handedOver
    || job.status === 'FAILED' || job.status === 'CANCELLED' || job.status === 'EXPIRED').length
  const openSummary = current ? `1건 · ${statusPresentation[current.status].label}` : '없음'
  const turnSummary = detail?.pendingApproval
    ? stageTurn[detail.pendingApproval.stage]
    : current?.status === 'RUNNING' ? 'AI 가 작업하는 중'
      : current ? '다음 단계 준비 중' : '없음'
  const recentSummary = recent.length === 0
    ? '아직 없음'
    : `최근 ${recent.length}건 · 완료 ${recentDone} · 멈춤 ${recentStopped}`

  return <>
    {/* No refresh button: the screen polls every 15 seconds, and a button that repeats what
      * already happens on its own only asks the reader to wonder whether it is needed. */}
    <PageHead title="LLM CI/CD" description="한국어로 개발을 요청하고 단계마다 사람이 승인합니다." wrapActions>
      <span className="self-center"><Badge tone="run" dot={false}>단계마다 사람 승인</Badge></span>
      {monitoringAction}
    </PageHead>

    {/* The same strip the Agent 설정 screen opens with, drawn from shared tokens only. The loud
      * runner warning below still carries the instructions; this badge is the at-a-glance state. */}
    <div className="mb-[0.875rem] flex flex-wrap items-center gap-2 rounded-md border border-line bg-sub px-3 py-2 text-[0.71875rem] text-body">
      {runner === null
        ? <Badge tone="idle">실행기 확인 중</Badge>
        : runner.alive
          ? <Badge tone="ok">실행기 연결됨</Badge>
          : <Badge tone="fail">실행기 응답 없음</Badge>}
      <span>화면은 {POLL_INTERVAL_MS / 1000}초마다 저절로 새로 고쳐집니다. 계획·결과·반영은 사람이 차례로 승인합니다.</span>
    </div>

    {/* E6: 실행기가 죽으면 접수·진행이 조용히 멈춘다. "실패는 조용하지 않게" — 맨 위에 크게. */}
    {runner && !runner.alive && <div className="mb-[0.875rem]">
      <Callout tone="warn" icon="triangle-alert">
        <b>실행기가 응답하지 않습니다.</b>{' '}
        {runner.lastSeenAt
          ? `마지막 신호가 ${elapsedLabel(runner.lastSeenAt, undefined, nowMs)} 전입니다.`
          : '서버가 켜진 뒤 신호가 없습니다.'}{' '}
        실행기를 켜기 전에는 요청이 접수되지 않고, 진행 중이던 작업도 멈춰 있습니다.
        시스템 운영 담당자에게 실행기 실행을 요청해 주세요.
      </Callout>
    </div>}

    {failure && <div className="mb-[0.875rem]"><Callout tone="warn" icon="triangle-alert">{failure}</Callout></div>}

    {loading
      ? <section className={panel}><p className="p-4 text-[0.78125rem] text-muted">불러오는 중입니다…</p></section>
      : <>
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryFact label="진행 중인 요청" value={openSummary} />
          <SummaryFact label="지금 차례" value={turnSummary} />
          <SummaryFact label="최근 요청" value={recentSummary} />
        </div>

        {/*
          * The form is always here. Hiding it while a request was open sounded tidy until an
          * abandoned Job from a previous day sat in WAITING_APPROVAL forever and no new request
          * could be typed at all. The server never refused a second Job; only this screen did.
          */}
        <section className={`${panel} mt-[0.875rem]`}>
          <PanelTitle title="새 개발 요청" sub="한국어로 적으면 AI 가 계획부터 세웁니다" />
          <form className="px-4 pb-4 pt-[0.375rem]" onSubmit={submit}>
            {/* Full width, with the button beside the box: a sentence needs room to be written. */}
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <label className="block">
                <span className={fieldLabel}>무엇을 바꿀까요</span>
                <textarea
                  className={textarea}
                  rows={3}
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                  placeholder="예) 회원 목록에 가입일도 보이게 해줘"
                  disabled={submitting}
                />
              </label>
              <button
                type="submit"
                className={`${primaryButton} w-full justify-center md:h-[4.625rem] md:w-auto md:px-6`}
                disabled={submitting || requestText.trim() === ''}
              >
                {submitting ? '접수하는 중입니다…' : '요청 보내기'}
              </button>
            </div>

            <p className="mt-2 text-[0.6875rem] leading-5 text-muted-2">
              보내면 AI 가 계획을 세우고, 사람이 승인해야 다음 단계로 갑니다.
              요청에 여러 가지 일이 필요하면 알아서 나눠 차례로 진행하고, 그럴 때는
              확인해 달라는 요청이 여러 번 올 수 있습니다.
            </p>
          </form>
        </section>

        {/* A stopped request answers here instead of disappearing. The sentence carries the
          * next step, because "실패" alone leaves the writer with nothing to do about it. */}
        {lastFailed && <section className={`${panel} mt-[0.875rem]`}>
          <PanelTitle
            title={lastFailed.handedOver
              ? '이 요청은 사람이 이어받아야 합니다'
              : lastFailed.refused ? '이 요청은 진행할 수 없습니다'
                // Nothing broke, so the heading does not say something did. When this leg
                // was the data half of a split, the heading names that half - otherwise
                // "이미 되어 있다" reads as the whole request and the screen job that starts
                // right after makes no sense.
                : lastFailed.failureCode === NOTHING_TO_CHANGE
                  ? (continuedAfterNothing === lastFailed.jobId
                    ? '서버 쪽은 이미 되어 있었습니다'
                    : '이미 되어 있어 바꿀 것이 없었습니다')
                  : '직전 요청이 중단됐습니다'}
            sub={lastFailed.requestText}
          />
          <div className="px-4 pb-4 pt-[0.375rem]">
            <Callout tone="warn" icon="triangle-alert">
              {lastFailed.handedOver
                ? `AI 가 ${handover?.rounds ?? 3}번 다시 만들었지만 검토를 통과하지 못했습니다. 아래 기록을 개발 담당자에게 전달해 주세요.`
                : lastFailed.refused
                  ? (refusedReason
                    ?? '요청한 내용이 지금 허용된 작업 범위 밖이라 진행하지 않았습니다. 최고관리자에게 울타리 설정을 요청해 주세요.')
                  : continuedAfterNothing === lastFailed.jobId
                    ? '이 요청에 필요한 서버 쪽 준비는 이미 되어 있어서 고칠 것이 없었습니다. 이어서 화면 작업을 시작했습니다. 아래에서 진행 상황을 확인해 주세요.'
                    : failureReason(lastFailed.failureCode)}
            </Callout>
            {lastFailed.handedOver && handover && <HandoverRecord handover={handover} />}
          </div>
        </section>}

        {current && lastFailed && <p className="mt-[0.875rem] text-[0.71875rem] leading-5 text-muted-2">
          아래는 이전에 보낸 요청이며, 아직 승인을 기다리고 있습니다.
        </p>}
        <LiveStatus job={current} detail={detail} updatedAt={nowMs} />

        {current && <>
          {pendingSecond && current?.jobId === pendingSecond.firstJobId
            && <section className={`${panel} mt-[0.875rem]`}>
              <PanelTitle
                title="이 요청은 두 가지 일이 필요합니다"
                sub="차례로 진행합니다. 확인해 달라는 요청이 두 번 올 수 있습니다"
              />
              <ol className="px-4 pb-4 pt-[0.375rem] space-y-2">
                <li className="flex items-start gap-2 text-[0.8125rem] leading-[1.6] text-body">
                  <Badge tone="run" dot={false}>지금 진행 중</Badge>
                  <span className="flex-1">{pendingSecond.firstText}</span>
                </li>
                <li className="flex items-start gap-2 text-[0.8125rem] leading-[1.6] text-body">
                  <Badge tone="wait" dot={false}>끝나면 자동으로</Badge>
                  <span className="flex-1">{pendingSecond.secondText}</span>
                </li>
              </ol>
            </section>}
          {detail?.pendingApproval?.stage === 'SCOPE' && <PlanApproval
            plan={detail.plan}
            pending={detail.pendingApproval}
            busy={deciding}
            onDecide={decide}
          />}
          {detail?.pendingApproval?.stage === 'CANDIDATE' && <CandidateApproval
            detail={detail}
            pending={detail.pendingApproval}
            busy={deciding}
            onDecide={decide}
          />}
          {detail?.pendingApproval && finalStages.includes(detail.pendingApproval.stage) && <FinalApproval
            detail={detail}
            pending={detail.pendingApproval}
            busy={deciding}
            role={role}
            onDecide={decide}
          />}
          {/*
            * Placed apart from the approval panels, never beside a reject button. The two read
            * alike and mean opposite things - rejecting a preview starts another attempt - and
            * a mis-click there costs a full model run.
            */}
          <CancelRequest status={current.status} busy={cancelling} onCancel={cancel} />
        </>}

        <CodingActivity
          alerts={unseen(notifications, seenBeforeOpening)}
          history={history}
          nowMs={nowMs}
        />
      </>}
  </>
}

/**
 * Whose move it is, per approval stage. Worded apart from the approval panel titles on purpose:
 * the summary sits on the same screen, and a second "코드 승인" would read as a second gate.
 */
const stageTurn: Record<ApprovalStage, string> = {
  SCOPE: '계획 확인 차례',
  CANDIDATE: '결과 확인 차례',
  GITHUB: '코드 승인 차례',
  CMS: 'CMS 반영 승인 차례',
  DEPLOY: '배포 승인 차례',
}

/** One summary card, in the shape of the Agent 설정 screen's fact cards. */
function SummaryFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-line-soft bg-sub p-3">
    <small className="block text-[0.6875rem] text-muted-2">{label}</small>
    <b className="mt-1 block text-[0.78125rem] font-semibold text-body">{value}</b>
  </div>
}

/**
 * What happened while this administrator was away.
 *
 * The two administrators take turns - one approves the plan, the other the release - and
 * neither could see the other's move without opening every request one by one. Each line
 * names the person, because "누가 승인했나" is what an approval ledger is for.
 *
 * <p>Called 승인 알림 rather than 새 소식: every line is an approval somebody decided or an
 * approval waiting on this reader, and the header bell already calls the same feed 새 알림.
 */
function ApprovalAlerts({ items, nowMs }: { items: CodingNotification[]; nowMs: number }) {
  if (items.length === 0) {
    return <p className="px-4 py-4 text-[0.71875rem] text-muted-2">승인 알림이 없습니다.</p>
  }
  return <ul className="px-4 py-[0.375rem]">
    {items.slice(0, 8).map((item) => <li
      key={`${item.kind}-${item.jobId}-${item.occurredAt ?? ''}`}
      className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 border-b border-row-line py-[0.5625rem] last:border-b-0"
    >
      <span className="min-w-0 flex-1">
        <span className="text-[0.78125rem] leading-[1.6] text-body">
          {notificationSentence(item)}
        </span>
        {item.requestText && <small className="mt-[0.125rem] block truncate text-[0.6875rem] text-muted-2">
          {item.requestText}
        </small>}
      </span>
      <small className="shrink-0 text-[0.6875rem] text-muted-2">
        {sinceLabel(item.occurredAt, nowMs)}
      </small>
    </li>)}
  </ul>
}

/**
 * E6, the execution history. Each row answers the two questions a waiting administrator has:
 * "어디까지 갔나"(진행 상태) and "얼마나 걸리고 있나"(경과 시간). The runner warning lives at
 * the top of the page, not here, because it concerns every row at once.
 */
function ExecutionHistory({ items, nowMs }: { items: JobSummary[]; nowMs: number }) {
  if (items.length === 0) {
    return <p className="px-4 py-4 text-[0.71875rem] text-muted-2">아직 보낸 요청이 없습니다.</p>
  }
  return <ul className="px-4 py-[0.375rem]">
    {items.slice(0, 8).map((job) => {
      const presentation = job.refused
        ? { label: '진행 안 함', tone: 'idle' as const }
        : statusPresentation[job.status]
      const elapsed = elapsedLabel(job.createdAt, job.finishedAt, nowMs)
      return <li
        key={job.jobId}
        className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 border-b border-row-line py-[0.5625rem] last:border-b-0"
      >
        <span className="min-w-0 flex-1 truncate text-[0.78125rem] leading-[1.6] text-body">
          {job.requestText}
        </span>
        <span className="flex shrink-0 items-center gap-[0.625rem]">
          {job.currentStage && <small className="text-[0.6875rem] text-muted-2">{job.currentStage}</small>}
          {elapsed && <small className="text-[0.6875rem] text-muted-2">
            {job.finishedAt ? `${elapsed} 걸림` : `${elapsed}째 진행`}
          </small>}
          <Badge tone={presentation.tone}>{presentation.label}</Badge>
        </span>
      </li>
    })}
  </ul>
}

type ActivityTab = 'alerts' | 'history'

/**
 * Approval alerts and the execution history, sharing one panel of a fixed height.
 *
 * <p>Each list used to be its own panel sized by its rows, and the alerts panel vanished when it
 * had nothing to say, so the page changed shape whenever an alert arrived or was read. A fixed
 * frame that scrolls inside keeps the page still; the counts on the tabs carry the change.
 */
function CodingActivity({ alerts, history, nowMs }: {
  alerts: CodingNotification[]
  history: JobSummary[]
  nowMs: number
}) {
  const [tab, setTab] = useState<ActivityTab>('alerts')
  const tabs: { id: ActivityTab; label: string; count: number }[] = [
    { id: 'alerts', label: '승인 알림', count: Math.min(alerts.length, 8) },
    { id: 'history', label: '실행 이력', count: Math.min(history.length, 8) },
  ]
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next: ActivityTab = tab === 'alerts' ? 'history' : 'alerts'
    setTab(next)
    document.getElementById(`coding-activity-tab-${next}`)?.focus()
  }
  return <section className={`${panel} mt-[0.875rem] flex h-[24rem] flex-col`}>
    <div className="flex shrink-0 gap-[1.375rem] border-b border-line-soft px-4" role="tablist" aria-label="승인 알림과 실행 이력">
      {tabs.map((item) => <button
        key={item.id}
        type="button"
        role="tab"
        id={`coding-activity-tab-${item.id}`}
        aria-selected={tab === item.id}
        aria-controls={`coding-activity-panel-${item.id}`}
        tabIndex={tab === item.id ? 0 : -1}
        className={`shrink-0 whitespace-nowrap bg-transparent px-[0.125rem] pb-[0.625rem] pt-3 text-[0.8125rem] ${tab === item.id ? 'font-semibold text-ink shadow-[inset_0_-2px_var(--primary)]' : 'font-medium text-muted'}`}
        onClick={() => setTab(item.id)}
        onKeyDown={moveFocus}
      >
        {item.label}
        <span className="ml-[0.375rem] rounded-full bg-idle-bg px-[0.375rem] text-[0.65625rem] font-semibold text-idle-fg">{item.count}</span>
      </button>)}
    </div>
    <div role="tabpanel" id="coding-activity-panel-alerts" aria-labelledby="coding-activity-tab-alerts" hidden={tab !== 'alerts'} className="min-h-0 flex-1 overflow-y-auto">
      <ApprovalAlerts items={alerts} nowMs={nowMs} />
    </div>
    <div role="tabpanel" id="coding-activity-panel-history" aria-labelledby="coding-activity-tab-history" hidden={tab !== 'history'} className="min-h-0 flex-1 overflow-y-auto">
      <ExecutionHistory items={history} nowMs={nowMs} />
    </div>
  </section>
}

function clockLabel(ms: number): string {
  const at = new Date(ms)
  return [at.getHours(), at.getMinutes(), at.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':')
}

/**
 * 실시간 상태: the open request, what it is doing, and how fresh that reading is.
 *
 * <p>The time is when this screen last heard from the server. The page polls, so a reader deciding
 * whether to wait needs to know the reading is recent. The attempt count comes from the detail the
 * tick already loaded and is left out until that detail belongs to this request.
 */
function LiveStatus({ job, detail, updatedAt }: { job: JobSummary | null; detail: JobDetail | null; updatedAt: number }) {
  const updated = `${clockLabel(updatedAt)} 갱신`
  if (!job) {
    return <section className={`${panel} mt-[0.875rem]`}>
      <PanelTitle title="실시간 상태" sub="지금 진행 중인 요청">
        <small className="text-[0.6875rem] text-muted-2">{updated}</small>
      </PanelTitle>
      <div className="flex items-center gap-3 p-4">
        <span className="grid h-[2.125rem] w-[2.125rem] shrink-0 place-items-center rounded-lg border border-line-soft bg-sub text-muted-3" aria-hidden="true">
          <Icon name="inbox" size={17} />
        </span>
        <span className="text-[0.78125rem] leading-[1.6] text-muted-2">
          <b className="block text-[0.8125rem] font-semibold text-ink">진행 중인 요청이 없습니다</b>
          새 개발 요청을 보내면 여기에서 계획과 결과를 확인하고 승인합니다.
        </span>
      </div>
    </section>
  }
  const presentation = statusPresentation[job.status]
  const attempt = detail && detail.jobId === job.jobId && detail.maxPipelineAttempts
    ? ` · 시도 ${detail.pipelineAttempt}/${detail.maxPipelineAttempts}`
    : ''
  return <section className={`${panel} mt-[0.875rem]`}>
    <PanelTitle title="실시간 상태" sub="지금 진행 중인 요청">
      <span className="flex items-center gap-[0.625rem]">
        <small className="text-[0.6875rem] text-muted-2">{updated}{attempt}</small>
        <Badge tone={presentation.tone}>{presentation.label}</Badge>
      </span>
    </PanelTitle>
    {/*
      * The Job id used to lead this card. It is a value no administrator can act on, and it
      * pushed the sentence they actually wrote into second place.
      */}
    <div className="p-4">
      <p className="max-w-[47.5rem] text-[0.875rem] leading-[1.6] text-body">{job.requestText}</p>
      <small className="mt-2 block text-[0.6875rem] text-muted-2">
        {repositoryLabel(job.repository)}{job.currentStage ? ` · ${job.currentStage}까지 진행됨` : ''}
      </small>
    </div>
    {nextStep[job.status] && <p className="border-t border-line-soft px-4 py-[0.8125rem] text-[0.71875rem] leading-5 text-body">
      {nextStep[job.status]}
    </p>}
  </section>
}

/**
 * E2, the plan approval.
 *
 * Rejecting here is not "try again": the server marks the attempt REJECTED and, because SCOPE
 * is not the CANDIDATE stage, cancels the Job outright. Only a preview rejection buys another
 * attempt. The screen says so before the click rather than after it.
 */
/**
 * Calling the request off for good.
 *
 * <p>This is not the reject button and must not read like one. Rejecting a preview is how the
 * administrator asks for another go; this is how they stop asking. The two sat on the same
 * panel in every earlier sketch and the wording had to carry the whole difference, so the
 * panel says what happens after the click rather than naming the action.
 *
 * <p>RUNNING has no button at all. The server refuses it - a model mid-run cannot be stopped
 * cleanly - and offering a control that always fails is worse than offering none, so the panel
 * explains that waiting is what works.
 */
function CancelRequest({ status, busy, onCancel }: {
  status: string
  busy: boolean
  onCancel: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  if (status !== 'PENDING' && status !== 'WAITING_APPROVAL' && status !== 'RUNNING') {
    return null
  }
  if (status === 'RUNNING') {
    return <section className={`${panel} mt-[0.875rem]`}>
      <p className="px-4 py-3 text-[0.71875rem] leading-5 text-muted-2">
        AI 가 작업하는 동안에는 요청을 취소할 수 없습니다. 작업이 끝나면 취소할 수 있습니다.
      </p>
    </section>
  }
  if (!confirming) {
    return <section className={`${panel} mt-[0.875rem]`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-[0.71875rem] leading-5 text-muted-2">더 필요 없는 요청이면 여기서 끝낼 수 있습니다</p>
        <button
          type="button"
          className={secondaryButton}
          disabled={busy}
          onClick={() => setConfirming(true)}
        >이 요청 그만두기</button>
      </div>
    </section>
  }
  return <section className={`${panel} mt-[0.875rem]`}>
    <PanelTitle
      title="이 요청을 그만둘까요"
      sub="여기서 끝냅니다. AI 가 다시 만들지 않습니다"
    />
    <div className="px-4 pb-4 pt-[0.375rem]">
      <p className="text-[0.8125rem] leading-[1.6] text-body">
        지금까지 AI 가 만든 것은 반영되지 않고 버려집니다. 되돌릴 수 없습니다.
        같은 일이 다시 필요하면 새 요청으로 넣어주세요.
      </p>
      <div className="mt-[0.875rem] flex flex-wrap gap-2">
        <button
          type="button"
          className={dangerButton}
          disabled={busy}
          onClick={onCancel}
        >{busy ? '취소하는 중입니다…' : '네, 그만둡니다'}</button>
        <button
          type="button"
          className={secondaryButton}
          disabled={busy}
          onClick={() => setConfirming(false)}
        >되돌아가기</button>
      </div>
    </div>
  </section>
}

function PlanApproval({ plan, pending, busy, onDecide }: {
  plan?: JobDetail['plan']
  pending: PendingApproval
  busy: boolean
  onDecide: (pending: PendingApproval, decision: ApprovalDecision, feedback?: string) => void
}) {
  const [rejecting, setRejecting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const criteria = plan?.acceptanceCriteria ?? []

  return <section className={`${panel} mt-[0.875rem]`}>
    <PanelTitle title="계획 확인" sub="AI 가 세운 계획입니다. 승인해야 코드를 쓰기 시작합니다">
      <Badge tone="wait">승인 대기</Badge>
    </PanelTitle>

    <div className="px-4 pb-4 pt-[0.375rem]">
      <p className="text-[0.8125rem] leading-[1.7] text-body">
        {plan?.summary ?? 'AI 가 계획 요약을 남기지 않았습니다. 아래 기준만 보고 판단해 주세요.'}
      </p>

      <b className={`${fieldLabel} mt-4 block`}>합격 기준</b>
      {criteria.length === 0
        ? <p className="mt-[0.375rem] text-[0.71875rem] text-muted-2">AI 가 합격 기준을 남기지 않았습니다.</p>
        : <ul className="mt-[0.375rem]">
          {criteria.map((criterion) => <li
            key={criterion}
            className="border-b border-row-line py-[0.5625rem] text-[0.78125rem] leading-[1.6] text-body"
          >{criterion}</li>)}
        </ul>}

      {rejecting
        ? <div className="mt-[0.875rem]">
          <Callout tone="warn" icon="triangle-alert">
            반려하면 이 요청은 취소됩니다. 같은 요청을 다시 시도하지 않으니, 필요하면 새로 요청해 주세요.
          </Callout>
          <label className="mt-[0.625rem] block">
            <span className={fieldLabel}>반려 사유</span>
            <textarea
              className={textarea}
              rows={3}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="어디가 잘못됐는지 적어주세요. 비워두면 보낼 수 없습니다."
              disabled={busy}
            />
          </label>
          <div className="mt-[0.625rem] flex flex-wrap gap-2">
            <button
              type="button"
              className={dangerButton}
              disabled={busy || feedback.trim() === ''}
              onClick={() => onDecide(pending, 'REJECTED', feedback.trim())}
            >{busy ? '보내는 중입니다…' : '반려하고 요청을 취소합니다'}</button>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => { setRejecting(false); setFeedback('') }}
            >되돌아가기</button>
          </div>
        </div>
        : <div className="mt-[0.875rem] flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryButton}
            disabled={busy}
            onClick={() => onDecide(pending, 'APPROVED')}
          >{busy ? '보내는 중입니다…' : '네, 진행하세요'}</button>
          <button
            type="button"
            className={secondaryButton}
            disabled={busy}
            onClick={() => setRejecting(true)}
          >아니요</button>
        </div>}
    </div>
  </section>
}

/**
 * E3, the preview approval.
 *
 * This is the screen a general administrator actually judges on. They cannot read the diff -
 * the server does not even send it to them - so the evidence here is the report, the
 * criteria approval 1 agreed to, and a preview they can click and use.
 *
 * Rejecting here does buy another attempt, unlike the plan approval, but only while attempts
 * remain. The warning changes with the count rather than promising a retry that will not happen.
 */
function CandidateApproval({ detail, pending, busy, onDecide }: {
  detail: JobDetail
  pending: PendingApproval
  busy: boolean
  onDecide: (pending: PendingApproval, decision: ApprovalDecision, feedback?: string) => void
}) {
  const [rejecting, setRejecting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const results = detail.report?.criteriaResults ?? []
  const retryLeft = detail.pipelineAttempt < detail.maxPipelineAttempts

  return <section className={`${panel} mt-[0.875rem]`}>
    <PanelTitle
      title="결과 확인"
      sub={`${detail.pipelineAttempt}번째 시도 · 최대 ${detail.maxPipelineAttempts}번`}
    >
      <Badge tone="wait">승인 대기</Badge>
    </PanelTitle>

    <div className="px-4 pb-4 pt-[0.375rem]">
      <p className="text-[0.8125rem] leading-[1.7] text-body">
        {detail.report?.summary ?? 'AI 가 결과 요약을 남기지 않았습니다. 아래 판정과 미리보기로 확인해 주세요.'}
      </p>

      <b className={`${fieldLabel} mt-4 block`}>기준별 판정</b>
      {results.length === 0
        ? <p className="mt-[0.375rem] text-[0.71875rem] text-muted-2">AI 가 기준별 판정을 남기지 않았습니다.</p>
        : <ul className="mt-[0.375rem]">
          {results.map((result) => <li
            key={result.criterion}
            className="flex items-center gap-[0.625rem] border-b border-row-line py-[0.5625rem] text-[0.78125rem] text-body"
          >
            <span className="flex-1">{result.criterion}</span>
            {/* Undecided is its own answer here: a criterion the model skipped is not a pass. */}
            <Badge tone={result.met === true ? 'ok' : result.met === false ? 'fail' : 'idle'}>
              {result.met === true ? '충족' : result.met === false ? '미충족' : '판정 없음'}
            </Badge>
          </li>)}
        </ul>}

      {/*
        * A failed check and a missing preview are separate facts, and both can be true at
        * once. Drawn separately for that reason: a Job whose test failed had its preview up
        * and working, and folding the two together took the link away - the one piece of
        * evidence this reader has - while leaving the approval button alone.
        */}
      {detail.preview?.checkFailure
        && <div className="mt-[0.875rem]">
          <Callout tone="warn" icon="triangle-alert">
            {detail.preview.checkFailure}
          </Callout>
        </div>}

      <div className="mt-[0.875rem]">
        {detail.preview?.ready && detail.preview.url
          ? <a
            className={secondaryButton}
            href={detail.preview.url}
            target="_blank"
            rel="noreferrer"
          >미리보기 열기</a>
          // A blocked preview and a preview still being raised are not the same news. Told
          // apart, because "잠시 기다리세요" on something that already failed keeps a person
          // waiting for a screen that is never going to appear.
          : detail.preview?.blocked
            ? <Callout tone="warn" icon="triangle-alert">
              {detail.preview.blocked}
            </Callout>
            : <Callout tone="warn" icon="triangle-alert">
              미리보기가 아직 준비되지 않았습니다. 눈으로 확인할 수 없는 상태이니 승인을 미뤄 주세요.
            </Callout>}
      </div>

      {rejecting
        ? <div className="mt-[0.875rem]">
          <Callout tone="warn" icon="triangle-alert">
            {retryLeft
              ? `반려하면 AI 가 처음부터 다시 만듭니다. ${detail.pipelineAttempt + 1}번째 시도가 됩니다.`
              : '마지막 시도였습니다. 반려하면 다시 만들지 않고 이 요청은 취소됩니다.'}
          </Callout>
          <label className="mt-[0.625rem] block">
            <span className={fieldLabel}>반려 사유</span>
            <textarea
              className={textarea}
              rows={3}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="무엇이 기대와 달랐는지 적어주세요. AI 가 이 글을 읽고 다시 만듭니다."
              disabled={busy}
            />
          </label>
          <div className="mt-[0.625rem] flex flex-wrap gap-2">
            <button
              type="button"
              className={dangerButton}
              disabled={busy || feedback.trim() === ''}
              onClick={() => onDecide(pending, 'REJECTED', feedback.trim())}
            >{busy ? '보내는 중입니다…' : retryLeft ? '반려하고 다시 만들게 합니다' : '반려하고 요청을 취소합니다'}</button>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => { setRejecting(false); setFeedback('') }}
            >되돌아가기</button>
          </div>
        </div>
        : <div className="mt-[0.875rem] flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryButton}
            disabled={busy}
            onClick={() => onDecide(pending, 'APPROVED')}
          >{busy ? '보내는 중입니다…' : '네, 이대로 좋습니다'}</button>
          <button
            type="button"
            className={secondaryButton}
            disabled={busy}
            onClick={() => setRejecting(true)}
          >아니요</button>
        </div>}
    </div>
  </section>
}

/**
 * 변경 내용을 줄 종류별로 색을 달리해 보여준다.
 *
 * 한 가지 색으로 흘려두면 무엇이 들어오고 무엇이 빠졌는지 `+`·`-` 한 글자로만 갈린다.
 * 이 화면은 코드를 읽지 못하는 관리자가 승인을 누르는 자리다.
 *
 * 색만으로 뜻을 전하지는 않는다. `+`와 `-`는 통합 diff 원문에 이미 들어 있어 그대로 남고,
 * 색은 그 위에 덧붙는 것이라 색을 못 보는 사람도 잃는 정보가 없다.
 */
function DiffView({ diff }: { diff: string }) {
  return <div className="mt-[0.375rem] max-h-[24rem] overflow-auto rounded-[0.3125rem] border border-line bg-sub font-mono text-[0.6875rem] leading-[1.7]">
    {diffLines(diff).map((line, index) => <div
      key={index}
      className={`whitespace-pre-wrap break-words px-3 ${
        line.kind === 'added' ? 'bg-ok-bg text-ok-fg'
          : line.kind === 'removed' ? 'bg-fail-bg text-fail-fg'
            : line.kind === 'hunk' ? 'text-link'
              : line.kind === 'meta' ? 'text-muted-2'
                : 'text-body'}`}
    >{line.text || ' '}</div>)}
  </div>
}

/**
 * E4, the approvals that follow the preview: GITHUB, then CMS, then DEPLOY.
 *
 * The guide draws these as one screen with [merge & deploy] [merge only] [reject], but the
 * server takes only approve or reject at each gate, and the graph runs the three gates in
 * sequence. "Merge only" is therefore what happens when the deploy gate is not approved -
 * a real outcome, reached by a different click, so the screen says which gate it is on
 * rather than offering a button the contract cannot honour.
 *
 * The technical block is absent for a general administrator because the server omits it, so
 * this reads the evidence it was given rather than deciding who may see what.
 */
function FinalApproval({ detail, pending, busy, role, onDecide }: {
  detail: JobDetail
  pending: PendingApproval
  busy: boolean
  role: AdminRole
  onDecide: (pending: PendingApproval, decision: ApprovalDecision, feedback?: string) => void
}) {
  const [rejecting, setRejecting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const copy = finalStageCopy[pending.stage]
  const technical = detail.technical
  /* The server refuses both decisions of a stage this role cannot decide, so rejecting is locked
   * with approving rather than left as the one button that still returns a 403. */
  const permitted = canDecide(role, pending.requiredRole)

  return <section className={`${panel} mt-[0.875rem]`}>
    <PanelTitle title={copy.title} sub={copy.sub}>
      <Badge tone={pending.requiredRole === 'SUPER_ADMIN' ? 'run' : 'wait'} dot={false}>
        {pending.requiredRole === 'SUPER_ADMIN' ? '최고관리자 전용' : '승인 대기'}
      </Badge>
    </PanelTitle>

    <div className="px-4 pb-4 pt-[0.375rem]">
      {/*
        * The other screen is told a candidate did not pass, and nothing more: it is read by
        * someone who cannot act on a compiler message. This reader can, so the runner's own
        * words are here and only here.
        */}
      {technical?.runnerFailure && <div className="mb-[0.875rem]">
        <Callout tone="warn" icon="triangle-alert">
          실행기가 이 후보에서 멈췄습니다.
          <span className="mt-1 block break-all font-mono text-[0.6875rem]">
            {technical.runnerFailure}
          </span>
        </Callout>
      </div>}

      {/* The Job started from a commit that may no longer be the head of dev. */}
      {technical?.baseShaFreshness?.stale && <div className="mb-[0.875rem]">
        <Callout tone="warn" icon="triangle-alert">
          이 작업이 시작된 뒤 dev 가 움직였습니다. 지금 dev 는
          {' '}{technical.baseShaFreshness.currentDevSha?.slice(0, 15) ?? '알 수 없음'} 입니다.
          충돌이 날 수 있으니 확인 후 승인해 주세요.
        </Callout>
      </div>}

      {technical
        ? <>
          <b className={`${fieldLabel} block`}>바뀐 파일 {technical.changedPaths.length}개</b>
          {technical.changedPaths.length === 0
            ? <p className="mt-[0.375rem] text-[0.71875rem] text-muted-2">바뀐 파일이 보고되지 않았습니다.</p>
            : <ul className="mt-[0.375rem] max-h-[15rem] overflow-y-auto">
              {technical.changedPaths.map((path) => <li
                key={path}
                className="border-b border-row-line py-[0.4375rem] font-mono text-[0.71875rem] text-body"
              >{path}</li>)}
            </ul>}

          <dl className="mt-[0.875rem] grid gap-x-4 gap-y-[0.375rem] text-[0.71875rem] sm:grid-cols-[8rem_1fr]">
            <dt className="text-muted-2">기준 커밋</dt>
            <dd className="font-mono text-body">{technical.baseSha ?? '없음'}</dd>
            <dt className="text-muted-2">결과 커밋</dt>
            <dd className="font-mono text-body">{technical.candidateSha ?? '없음'}</dd>
            <dt className="text-muted-2">변경 지문</dt>
            <dd className="font-mono text-body">{technical.diffDigest ?? '없음'}</dd>
            <dt className="text-muted-2">검사 프로필</dt>
            <dd className="text-body">{technical.checkProfile ?? '없음'}</dd>
          </dl>

          {/* A digest proves the bytes; only the diff says what they are. Without it this
            * screen asked for an approval of code nobody could read. */}
          {technical.diff
            ? <div className="mt-[0.875rem]">
              <b className={`${fieldLabel} block`}>변경 내용</b>
              <DiffView diff={technical.diff} />
            </div>
            : <div className="mt-[0.875rem]">
              <Callout tone="warn" icon="triangle-alert">
                변경 내용(diff)을 불러오지 못했습니다. 내용을 확인할 수 없다면 승인을 미뤄 주세요.
              </Callout>
            </div>}

          {/* Queuing CREATE_PR is a later slice, so this stays empty rather than pretending. */}
          <div className="mt-[0.875rem]">
            {technical.pullRequestUrl
              ? <a className={secondaryButton} href={technical.pullRequestUrl} target="_blank" rel="noreferrer">PR 열기</a>
              : <p className="text-[0.6875rem] leading-5 text-muted-2">
                PR 링크는 아직 기록되지 않았습니다. 변경 내용은 위 목록과 지문으로 확인해 주세요.
              </p>}
          </div>
        </>
        : <Callout tone="warn" icon="triangle-alert">
          코드 근거는 최고관리자에게만 전달됩니다. 이 계정에는 서버가 보내지 않았습니다.
        </Callout>}

      {rejecting
        ? <div className="mt-[0.875rem]">
          <Callout tone="warn" icon="triangle-alert">
            반려하면 이 요청은 취소됩니다. 다시 만들지 않으니, 필요하면 처음부터 새로 요청해 주세요.
            이미 올라간 PR 이 있다면 사람이 직접 닫아야 합니다.
          </Callout>
          <label className="mt-[0.625rem] block">
            <span className={fieldLabel}>반려 사유</span>
            <textarea
              className={textarea}
              rows={3}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="요청한 사람이 읽습니다. 무엇이 문제인지 적어주세요."
              disabled={busy}
            />
          </label>
          <div className="mt-[0.625rem] flex flex-wrap gap-2">
            <button
              type="button"
              className={dangerButton}
              disabled={busy || feedback.trim() === ''}
              onClick={() => onDecide(pending, 'REJECTED', feedback.trim())}
            >{busy ? '보내는 중입니다…' : '반려하고 요청을 취소합니다'}</button>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => { setRejecting(false); setFeedback('') }}
            >되돌아가기</button>
          </div>
        </div>
        : <>
          {!permitted && <div className="mt-[0.875rem]">
            <Callout tone="warn" icon="triangle-alert">
              이 단계는 {ROLE_LABELS[pending.requiredRole as AdminRole] ?? pending.requiredRole}만
              결정할 수 있습니다. 지금 로그인한 계정은 {ROLE_LABELS[role]}입니다.
              해당 계정으로 로그인하면 여기서 승인하거나 반려할 수 있습니다.
            </Callout>
          </div>}
          <div className="mt-[0.875rem] flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={busy || !permitted}
              onClick={() => onDecide(pending, 'APPROVED')}
            >{busy ? '보내는 중입니다…' : copy.approve}</button>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy || !permitted}
              onClick={() => setRejecting(true)}
            >아니요</button>
          </div>
        </>}
    </div>
  </section>
}
