import { useEffect, useState, type FormEvent } from 'react'
import { describeFailure } from '../../shared/api/error'
import {
  Badge, Callout, PageHead, PanelTitle, dangerButton, fieldLabel, panel, primaryButton,
  secondaryButton, smallButton, textarea, type Tone,
} from '../../shared/ui/primitives'
import type {
  ApprovalDecision, ApprovalStage, CodingConsoleApiClient, CodingJobStatus, JobDetail, JobSummary,
  PendingApproval,
} from './api'

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

/** A Job in any other status is finished, and a finished Job does not block a new request. */
const openStatuses: CodingJobStatus[] = ['PENDING', 'RUNNING', 'WAITING_APPROVAL']

/**
 * The runner only knows how to check out the backend today, so the server rejects every other
 * repository. Showing the frontend as locked is more honest than hiding it: the order is part
 * of the plan, not an accident.
 */
const repositories: { id: string; label: string; hint: string; available: boolean }[] = [
  { id: 'backend', label: '백엔드', hint: '데이터를 만드는 쪽', available: true },
  { id: 'frontend', label: '프론트엔드', hint: '아직 준비 중', available: false },
]

function repositoryLabel(id: string): string {
  return repositories.find((item) => item.id === id)?.label ?? id
}

function openJob(items: JobSummary[]): JobSummary | null {
  return items.find((item) => openStatuses.includes(item.status)) ?? null
}

export default function CodingWorkspace({ api }: { api: CodingConsoleApiClient }) {
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [current, setCurrent] = useState<JobSummary | null>(null)
  const [detail, setDetail] = useState<JobDetail | null>(null)
  const [requestText, setRequestText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  /**
   * The list says which request is open; the detail says what it is waiting for. Two calls
   * rather than one fat list, because only the opened request needs the plan and the
   * approval evidence.
   */
  useEffect(() => {
    let active = true
    setLoading(true)
    setFailure(null)
    void (async () => {
      let open: JobSummary | null = null
      try {
        open = openJob((await api.listJobs()).items)
      }
      catch (error: unknown) {
        if (active) { setCurrent(null); setDetail(null); setFailure(describeFailure(error)) }
        if (active) setLoading(false)
        return
      }
      if (!active) return
      setCurrent(open)
      setDetail(null)
      if (open) {
        try {
          const loaded = await api.getJob(open.jobId)
          if (active) setDetail(loaded ?? null)
        }
        catch (error: unknown) {
          if (active) setFailure(describeFailure(error))
        }
      }
      if (active) setLoading(false)
    })()
    return () => { active = false }
  }, [api, reloadToken])

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
      setReloadToken((token) => token + 1)
    }
    catch (error: unknown) {
      setFailure(describeFailure(error))
    }
    finally {
      setDeciding(false)
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
      const created = await api.createJob('backend', text)
      setDetail(null)
      setCurrent({
        jobId: created.job.jobId,
        repository: 'backend',
        requestText: text,
        status: created.job.status,
        createdAt: created.request.createdAt,
      })
      setRequestText('')
    }
    catch (error: unknown) {
      setFailure(describeFailure(error))
    }
    finally {
      setSubmitting(false)
    }
  }

  return <>
    <PageHead title="LLM DevOps" description="한국어로 개발을 요청하고 단계마다 사람이 승인합니다.">
      <button type="button" className={smallButton} onClick={() => setReloadToken((token) => token + 1)}>새로고침</button>
    </PageHead>

    {failure && <div className="mb-[0.875rem]"><Callout tone="warn" icon="triangle-alert">{failure}</Callout></div>}

    {loading
      ? <section className={panel}><p className="p-4 text-[0.78125rem] text-muted">불러오는 중입니다…</p></section>
      : current
        ? <>
          <CurrentRequest job={current} />
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
            onDecide={decide}
          />}
        </>
        : <section className={panel}>
          <PanelTitle title="새 개발 요청" sub="한국어로 적으면 AI 가 계획부터 세웁니다" />
          <form className="px-4 pb-4 pt-[0.375rem]" onSubmit={submit}>
            <fieldset className="border-0 p-0">
              <legend className={fieldLabel}>어디를 바꿀까요</legend>
              <div className="mt-[0.375rem] grid gap-2 sm:grid-cols-2">
                {repositories.map((item) => <label
                  key={item.id}
                  className={`flex items-center gap-[0.625rem] rounded-[0.3125rem] border px-3 py-[0.625rem] text-[0.78125rem] ${item.available ? 'border-field-line bg-white' : 'border-line-soft bg-sub text-muted-3'}`}
                >
                  <input
                    type="radio"
                    name="repository"
                    value={item.id}
                    defaultChecked={item.available}
                    disabled={!item.available}
                  />
                  <b className="font-semibold">{item.label}</b>
                  <small className="ml-auto text-[0.6875rem] text-muted-2">{item.hint}</small>
                </label>)}
              </div>
            </fieldset>

            <label className="mt-4 block">
              <span className={fieldLabel}>무엇을 바꿀까요</span>
              <textarea
                className={textarea}
                rows={4}
                value={requestText}
                onChange={(event) => setRequestText(event.target.value)}
                placeholder="예) 회원 목록에 가입일도 보이게 해줘"
                disabled={submitting}
              />
            </label>

            <p className="mt-2 text-[0.6875rem] leading-5 text-muted-2">
              데이터를 만드는 쪽(백엔드)을 먼저, 보여주는 쪽(프론트)을 나중에 엽니다.
              보내면 AI 가 계획을 세우고, 사람이 승인해야 다음 단계로 갑니다.
            </p>

            <button
              type="submit"
              className={`${primaryButton} mt-[0.875rem] w-full justify-center`}
              disabled={submitting || requestText.trim() === ''}
            >
              {submitting ? '접수하는 중입니다…' : '요청 보내기'}
            </button>
          </form>
        </section>}
  </>
}

function CurrentRequest({ job }: { job: JobSummary }) {
  const presentation = statusPresentation[job.status]
  return <section className={panel}>
    <div className="flex flex-wrap items-start justify-between gap-5 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[0.71875rem] text-muted-2">
          <span className="font-mono">{job.jobId.slice(0, 8)}</span><span>·</span><span>{repositoryLabel(job.repository)}</span>
        </div>
        <p className="mt-[0.4375rem] max-w-[47.5rem] text-[0.875rem] leading-[1.6] text-body">{job.requestText}</p>
        {job.currentStage && <small className="mt-2 block text-[0.6875rem] text-muted-2">현재 단계 · {job.currentStage}</small>}
      </div>
      <Badge tone={presentation.tone}>{presentation.label}</Badge>
    </div>
    <p className="border-t border-line-soft px-4 py-[0.8125rem] text-[0.6875rem] leading-5 text-muted-2">
      진행 중인 요청이 있습니다. 이 요청이 끝나면 새 요청을 보낼 수 있습니다.
    </p>
  </section>
}

/**
 * E2, the plan approval.
 *
 * Rejecting here is not "try again": the server marks the attempt REJECTED and, because SCOPE
 * is not the CANDIDATE stage, cancels the Job outright. Only a preview rejection buys another
 * attempt. The screen says so before the click rather than after it.
 */
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

      <div className="mt-[0.875rem]">
        {detail.preview?.ready && detail.preview.url
          ? <a
            className={secondaryButton}
            href={detail.preview.url}
            target="_blank"
            rel="noreferrer"
          >미리보기 열기</a>
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
function FinalApproval({ detail, pending, busy, onDecide }: {
  detail: JobDetail
  pending: PendingApproval
  busy: boolean
  onDecide: (pending: PendingApproval, decision: ApprovalDecision, feedback?: string) => void
}) {
  const [rejecting, setRejecting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const copy = finalStageCopy[pending.stage]
  const technical = detail.technical

  return <section className={`${panel} mt-[0.875rem]`}>
    <PanelTitle title={copy.title} sub={copy.sub}>
      <Badge tone={pending.requiredRole === 'SUPER_ADMIN' ? 'run' : 'wait'} dot={false}>
        {pending.requiredRole === 'SUPER_ADMIN' ? '최고관리자 전용' : '승인 대기'}
      </Badge>
    </PanelTitle>

    <div className="px-4 pb-4 pt-[0.375rem]">
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
        : <div className="mt-[0.875rem] flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryButton}
            disabled={busy}
            onClick={() => onDecide(pending, 'APPROVED')}
          >{busy ? '보내는 중입니다…' : copy.approve}</button>
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
