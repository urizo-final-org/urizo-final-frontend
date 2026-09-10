import { useEffect, useState } from 'react'
import { Icon } from '../../shared/ui/icons'
import { secondaryButton } from '../../shared/ui/primitives'
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
    <code className="rounded border border-line-soft bg-sub px-2 py-1 text-xs text-muted-2" title={`Job ${jobId}`} aria-label={`활성 Job ${jobId}`}>
      Job {jobId.length > 8 ? `${jobId.slice(0, 8)}…` : jobId}
    </code>
    <a className={secondaryButton} href={monitoringJobHref(jobId)} title="Agent 설정에서 이 Job의 실행 모니터링 열기">
      <Icon name="activity" size={14} />실시간 모니터링<Icon name="arrow-up-right" size={13} />
    </a>
  </div> : null
}
