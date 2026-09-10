import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../shared/ui/icons'
import { panel } from '../../shared/ui/primitives'
import type { CodingConsoleApiClient, CodingNotification } from './api'
import { lastSeenAt, notificationSentence, sinceLabel, unseen } from './notifications'

/**
 * The header bell, told what it is ringing about.
 *
 * An approval that nobody is looking at is the one failure mode this product cannot afford:
 * the whole point is that a person decides before the AI's work goes anywhere. Until now the
 * only way to learn a request was waiting was to open the screen and press refresh, which
 * means the person has to already suspect there is something to see.
 *
 * It rings for two kinds of news: an approval now waiting on this administrator, and a
 * decision somebody else made. The second one matters because the two administrators take
 * turns - the general administrator approves the plan, the super administrator the release -
 * and neither can see the other's move without being told.
 *
 * Pressing it opens the news rather than the screen. Asking a reader to leave whatever they
 * were doing just to find out whether anything happened is the same cost the bell exists to
 * remove; the lines are here, and the one they pick takes them to it.
 *
 * It counts, it does not invent: a failed poll leaves the previous list alone rather than
 * showing a zero that would read as "nothing is waiting".
 */
const POLL_INTERVAL_MS = 15_000
const LISTED = 8

export default function ApprovalBell({ api, onOpen }: {
  api: CodingConsoleApiClient
  onOpen: () => void
}) {
  const [news, setNews] = useState<CodingNotification[] | null>(null)
  const [open, setOpen] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true

    async function count() {
      // A hidden tab is not being read, so it does not need to be polled.
      if (document.hidden) return
      try {
        const feed = await api.notifications()
        // A feed without a list is a failed poll, not an empty one: keep what was known.
        if (active && Array.isArray(feed.items)) {
          setNews(unseen(feed.items, lastSeenAt()))
          setNowMs(Date.now())
        }
      }
      catch {
        // Keep the last known list. A wrong zero is worse than a stale number here.
      }
    }

    void count()
    const timer = setInterval(() => void count(), POLL_INTERVAL_MS)
    return () => { active = false; clearInterval(timer) }
  }, [api])

  /* A panel that will not close is worse than no panel, so both the pointer and the keyboard
   * get a way out. Listeners exist only while it is open. */
  useEffect(() => {
    if (!open) return

    function away(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const waiting = news === null ? null : news.length
  const label = waiting !== null && waiting > 0
    ? `새 알림 ${waiting}건 · 알림 목록 열기`
    : '알림 목록 열기'

  /*
   * Reading the news is opening the screen, not opening this list: the screen shows the same
   * items and marks them read once it holds the feed. A mark set here would empty that panel
   * before it ever rendered, which is the whole defect this replaces.
   */
  function read() {
    setOpen(false)
    setNews([])
    onOpen()
  }

  return <div className="relative flex items-center" ref={box}>
    <button
      type="button"
      className="relative flex items-center text-muted hover:text-strong"
      onClick={() => setOpen((was) => !was)}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={label}
      title={label}
    >
      <Icon name="bell" size={16} />
      {waiting !== null && waiting > 0 && <span
        className="absolute -right-[0.375rem] -top-[0.3125rem] grid h-[0.9375rem] min-w-[0.9375rem] place-items-center rounded-full bg-fail-fg px-[0.1875rem] text-[0.5625rem] font-bold text-white"
      >{waiting > 99 ? '99+' : waiting}</span>}
    </button>

    {open && <div
      className={`${panel} absolute right-0 top-full z-40 mt-[0.5625rem] w-[24rem] max-w-[calc(100vw-2rem)] shadow-[0_18px_45px_rgba(22,34,47,.18)]`}
      role="dialog"
      aria-label="새 알림"
    >
      <div className="border-b border-line-soft px-4 py-[0.6875rem]">
        <b className="block text-[0.84375rem] font-semibold">새 알림</b>
        <small className="mt-[0.125rem] block text-[0.6875rem] font-normal text-muted-2">
          아직 확인하지 않은 결정과 내 승인 차례
        </small>
      </div>

      <NewsLines items={news} nowMs={nowMs} onPick={read} />

      {/* The way out for a reader whose news is not in the list - or who has none at all. */}
      <button
        type="button"
        className="block w-full border-t border-line-soft px-4 py-[0.625rem] text-left text-[0.71875rem] font-semibold text-strong hover:bg-sub"
        onClick={read}
      >LLM DevOps 열기</button>
    </div>}
  </div>
}

/**
 * One line per piece of news, in the words the approval ledger uses.
 *
 * A list that has not arrived is not an empty list. Saying "새 알림이 없습니다" before the
 * first poll answers - or after one that failed - is the same wrong zero the badge refuses
 * to show, so the two cases read differently.
 */
function NewsLines({ items, nowMs, onPick }: {
  items: CodingNotification[] | null
  nowMs: number
  onPick: () => void
}) {
  if (items === null) return <p className="px-4 py-[0.9375rem] text-[0.78125rem] text-muted">
    알림을 아직 확인하지 못했습니다.
  </p>
  if (items.length === 0) return <p className="px-4 py-[0.9375rem] text-[0.78125rem] text-muted">
    새 알림이 없습니다.
  </p>

  return <ul className="max-h-[21rem] overflow-y-auto">
    {items.slice(0, LISTED).map((item) => <li key={`${item.kind}-${item.jobId}-${item.occurredAt ?? ''}`}>
      <button
        type="button"
        className="block w-full border-b border-row-line px-4 py-[0.5625rem] text-left last:border-b-0 hover:bg-sub"
        onClick={onPick}
      >
        <span className="flex items-baseline justify-between gap-4">
          <span className="text-[0.78125rem] leading-[1.6] text-body">{notificationSentence(item)}</span>
          <small className="shrink-0 text-[0.6875rem] text-muted-2">{sinceLabel(item.occurredAt, nowMs)}</small>
        </span>
        {item.requestText && <small className="mt-[0.125rem] block truncate text-[0.6875rem] text-muted-2">
          {item.requestText}
        </small>}
      </button>
    </li>)}
  </ul>
}
