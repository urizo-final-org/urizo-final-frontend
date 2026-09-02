import { useEffect, useState, type FormEvent } from 'react'
import { describeFailure } from '../../shared/api/error'
import {
  Badge, Callout, PageHead, PanelTitle, fieldLabel, panel, primaryButton, smallButton, textarea,
  type Tone,
} from '../../shared/ui/primitives'
import type { CodingConsoleApiClient, CodingJobStatus, JobSummary } from './api'

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
  const [requestText, setRequestText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setFailure(null)
    void api.listJobs().then((list) => {
      if (active) setCurrent(openJob(list.items))
    }).catch((error: unknown) => {
      if (active) { setCurrent(null); setFailure(describeFailure(error)) }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, reloadToken])

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
        ? <CurrentRequest job={current} />
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
