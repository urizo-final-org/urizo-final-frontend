import { useEffect, useState } from 'react'
import { Icon } from '../../shared/ui/icons'
import type { CodingConsoleApiClient } from './api'

/**
 * The header bell, told what it is ringing about.
 *
 * An approval that nobody is looking at is the one failure mode this product cannot afford:
 * the whole point is that a person decides before the AI's work goes anywhere. Until now the
 * only way to learn a request was waiting was to open the screen and press refresh, which
 * means the person has to already suspect there is something to see.
 *
 * It counts, it does not invent: a failed poll leaves the previous count alone rather than
 * showing a zero that would read as "nothing is waiting".
 */
const POLL_INTERVAL_MS = 15_000

export default function ApprovalBell({ api, onOpen }: {
  api: CodingConsoleApiClient
  onOpen: () => void
}) {
  const [waiting, setWaiting] = useState<number | null>(null)

  useEffect(() => {
    let active = true

    async function count() {
      // A hidden tab is not being read, so it does not need to be polled.
      if (document.hidden) return
      try {
        const list = await api.listJobs(100)
        if (active) setWaiting(list.items.filter((job) => job.status === 'WAITING_APPROVAL').length)
      }
      catch {
        // Keep the last known count. A wrong zero is worse than a stale number here.
      }
    }

    void count()
    const timer = setInterval(() => void count(), POLL_INTERVAL_MS)
    return () => { active = false; clearInterval(timer) }
  }, [api])

  const label = waiting && waiting > 0
    ? `승인 대기 ${waiting}건 · LLM DevOps 열기`
    : 'LLM DevOps 열기'

  return <button
    type="button"
    className="relative flex items-center text-muted hover:text-strong"
    onClick={onOpen}
    aria-label={label}
    title={label}
  >
    <Icon name="bell" size={16} />
    {waiting !== null && waiting > 0 && <span
      className="absolute -right-[0.375rem] -top-[0.3125rem] grid h-[0.9375rem] min-w-[0.9375rem] place-items-center rounded-full bg-fail-fg px-[0.1875rem] text-[0.5625rem] font-bold text-white"
    >{waiting > 99 ? '99+' : waiting}</span>}
  </button>
}
