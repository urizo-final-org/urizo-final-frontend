import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '../../shared/ui/icons'
import { primaryButton, secondaryButton } from '../../shared/ui/primitives'
import type { AgentSettingsApiClient, ProfileKey } from './api'

export function monitoringJobHref(jobId: string) {
  return `/admin/models?tab=monitoring&jobId=${encodeURIComponent(jobId)}`
}

/** Read-only shortcut; the caller must enforce the Agent-settings route's existing role boundary. */
export default function ActiveJobMonitoringLink({ api, profileKey }: {
  api: AgentSettingsApiClient
  profileKey: ProfileKey
}) {
  const [jobId, setJobId] = useState('')
  useEffect(() => {
    let disposed = false
    let timer: number | undefined
    let controller: AbortController | undefined
    setJobId('')
    const poll = async () => {
      if (disposed || document.hidden || controller) return
      const request = new AbortController()
      controller = request
      try {
        const response = await api.listMonitoringJobs(request.signal)
        if (!disposed && !request.signal.aborted && !document.hidden) {
          setJobId(response.jobs.find((job) => !job.domainTerminal && job.profileKey === profileKey)?.jobId ?? '')
        }
      } catch {
        // A failed read must not advertise an old Job as currently active.
        if (!disposed && !request.signal.aborted) setJobId('')
      } finally {
        if (!disposed && controller === request) {
          controller = undefined
          if (!document.hidden) timer = window.setTimeout(() => void poll(), 5_000)
        }
      }
    }
    const visibilityChanged = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      if (document.hidden) { controller?.abort(); controller = undefined }
      else void poll()
    }
    document.addEventListener('visibilitychange', visibilityChanged)
    void poll()
    return () => {
      disposed = true
      controller?.abort()
      if (timer !== undefined) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [api, profileKey])

  return jobId ? <div className="flex flex-wrap items-center gap-2">
    <ActiveJobId key={jobId} jobId={jobId} />
    <a className={secondaryButton} href={monitoringJobHref(jobId)} title="Agent 설정에서 이 Job의 실행 모니터링 열기">
      <Icon name="activity" size={14} />실시간 모니터링<Icon name="arrow-up-right" size={13} />
    </a>
  </div> : null
}

function ActiveJobId({ jobId }: { jobId: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  const [closing, setClosing] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const copyRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const dialogId = useId()
  useEffect(() => {
    if (copyState !== 'copied') return
    const dialog = dialogRef.current
    dialog?.showModal()
    confirmRef.current?.focus()
    const trigger = copyRef.current
    return () => {
      dialog?.close()
      trigger?.focus()
    }
  }, [copyState])

  useEffect(() => {
    if (copyState !== 'copied') return
    // Match the existing 2.6s success notice; its last 22% is the exit animation.
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setCopyState('idle'), closing ? (reducedMotion ? 0 : 572) : 2600)
    return () => window.clearTimeout(timer)
  }, [copyState, closing])

  async function copyJobId() {
    setClosing(false)
    setCopyState('copying')
    try {
      await navigator.clipboard.writeText(jobId)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  return <>
    <div className="inline-flex items-center rounded border border-line-soft bg-sub text-muted-2">
      <code className="px-2 py-1 text-xs" title={`Job ${jobId}`} aria-label={`활성 Job ${jobId}`}>
        Job {jobId.length > 8 ? `${jobId.slice(0, 8)}…` : jobId}
      </code>
      <button ref={copyRef} type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded hover:bg-panel hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50" aria-label="전체 Job ID 복사" title={copyState === 'copied' ? 'Job ID 복사 완료' : '전체 Job ID 복사'} disabled={copyState === 'copying'} onClick={() => void copyJobId()}>
        <Icon name={copyState === 'copied' ? 'check' : 'copy'} size={14} />
      </button>
    </div>
    <span role="status" className={copyState === 'error' ? 'text-xs text-muted-2' : 'sr-only'}>
      {copyState === 'copied' ? 'Job ID 복사 완료' : copyState === 'error' ? '복사하지 못했습니다. 브라우저 클립보드 권한을 확인해 주세요.' : ''}
    </span>
    {copyState === 'copied' && <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby={`${dialogId}-title`}
      aria-describedby={`${dialogId}-description`}
      data-closing={closing}
      onCancel={(event) => { event.preventDefault(); setClosing(true) }}
      className="job-copy-alert cms-success-toast fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[30rem] rounded-xl border border-white/10 bg-[#16293c] p-0 text-white shadow-[0_24px_70px_rgba(22,41,60,.35)] backdrop:bg-[#16293c]/50 backdrop:backdrop-blur-sm"
    >
      <div className="p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-[#16293c]"><Icon name="check" size={20} /></span>
          <h2 id={`${dialogId}-title`} className="text-base font-semibold text-white">복사 완료</h2>
        </div>
        <p id={`${dialogId}-description`} className="mt-5 text-sm leading-6 text-white/90">Job ID가 복사되었습니다. 검색창에 붙여넣어 사용하세요.</p>
        <div className="mt-6 flex justify-end">
          <button ref={confirmRef} type="button" className={`${primaryButton} hover:brightness-110`} style={{ backgroundColor: '#65c6ca', color: '#16293c', outlineColor: '#65c6ca' }} onClick={() => setClosing(true)}>확인</button>
        </div>
      </div>
    </dialog>}
  </>
}
