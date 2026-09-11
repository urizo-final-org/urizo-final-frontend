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

/**
 * 이 종이 코딩 알림 말고도 실어 나르는 한 줄.
 *
 * <p>승인이 밀려 있다는 소식은 코딩 파이프라인만의 것이 아니다. RAG 쪽에도 최고 관리자만
 * 처리할 수 있는 일감(승인 대기 빌드·자료 갱신 요청)이 있고, 그것도 화면에 들어가야만
 * 보였다. 종을 도메인마다 하나씩 다는 대신 이 한 자리에 모은다 — 읽는 사람이 던지는
 * 질문("나 볼 거 있나")이 하나이기 때문이다.
 *
 * <p>각 줄이 자기 문장과 자기 목적지를 들고 온다. 종은 코딩 도메인을 알지만 RAG는 모른다.
 */
export type BellNotice = {
  id: string
  text: string
  /** 한 줄 아래 흐리게 붙는 부연(요청 사유 등). 없으면 그리지 않는다. */
  detail?: string
  /** "3분 전"을 만드는 기준 시각. 코딩 알림의 `occurredAt`과 같은 자리다. */
  at?: string
  onPick: () => void
}

export default function ApprovalBell({ api, onOpen, extra = [] }: {
  api: CodingConsoleApiClient
  onOpen: () => void
  /**
   * 코딩 알림 위에 함께 그릴 줄. 넘기는 쪽은 "아직 안 끝난 일"만 담아 보내고, 고른 줄은
   * 이 창이 치운다(`dismissed`).
   */
  extra?: BellNotice[]
}) {
  const [news, setNews] = useState<CodingNotification[] | null>(null)
  const [open, setOpen] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  /* 고른 줄은 화면에서 치운다 — 확인하러 들어가는 것이 곧 그 알림에 대한 응답이다.
   * 이 표시는 이 창 안에서만 산다. 새로고침하면 서버가 아직 열어 둔 요청은 다시 올라온다 —
   * 실제로 닫는 것은 활성화·롤백이고, 화면이 그 사실을 앞질러 가지 않는다. */
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())
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

  const notices = extra.filter((notice) => !dismissed.has(notice.id))
  /* 한쪽이 아직 안 왔어도 다른 쪽은 셀 수 있다. 둘 다 없을 때만 숫자를 감춘다 —
   * 실패한 폴링이 "다 처리했다"로 읽히는 0을 띄우지 않기 위한 규칙은 그대로다. */
  const waiting = news === null && notices.length === 0
    ? null
    : (news?.length ?? 0) + notices.length
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

  /*
   * 다른 도메인의 줄은 코딩 목록을 건드리지 않는다. `setNews([])`가 여기서 도는 순간,
   * 코딩 알림을 읽음으로 만드는 화면(LLM DevOps)에는 가지도 않은 채 숫자만 지워지고
   * 다음 폴링에 그대로 되살아난다 — 깜빡이는 뱃지가 된다.
   */
  function pick(notice: BellNotice) {
    setOpen(false)
    setDismissed((seen) => new Set(seen).add(notice.id))
    notice.onPick()
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

      <NewsLines items={news} extra={notices} nowMs={nowMs} onPick={read} onPickNotice={pick} />

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
 *
 * <p>다른 도메인의 줄이 위에 온다. 코딩 알림은 매 폴링마다 갈아 끼워지지만 그 줄들은
 * 사람이 처리해야 사라지는 일감이라, 스크롤 아래로 밀려나면 안 된다.
 */
function NewsLines({ items, extra, nowMs, onPick, onPickNotice }: {
  items: CodingNotification[] | null
  extra: BellNotice[]
  nowMs: number
  onPick: () => void
  onPickNotice: (notice: BellNotice) => void
}) {
  const lines = [
    ...extra.map((notice) => ({
      key: `notice-${notice.id}`,
      text: notice.text,
      detail: notice.detail,
      at: notice.at,
      choose: () => onPickNotice(notice),
    })),
    ...(items ?? []).map((item) => ({
      key: `${item.kind}-${item.jobId}-${item.occurredAt ?? ''}`,
      text: notificationSentence(item),
      detail: item.requestText,
      at: item.occurredAt,
      choose: onPick,
    })),
  ]

  if (lines.length === 0) return <p className="px-4 py-[0.9375rem] text-[0.78125rem] text-muted">
    {items === null ? '알림을 아직 확인하지 못했습니다.' : '새 알림이 없습니다.'}
  </p>

  return <ul className="max-h-[21rem] overflow-y-auto">
    {lines.slice(0, LISTED).map((line) => <li key={line.key}>
      <button
        type="button"
        className="block w-full border-b border-row-line px-4 py-[0.5625rem] text-left last:border-b-0 hover:bg-sub"
        onClick={line.choose}
      >
        <span className="flex items-baseline justify-between gap-4">
          <span className="text-[0.78125rem] leading-[1.6] text-body">{line.text}</span>
          <small className="shrink-0 text-[0.6875rem] text-muted-2">{sinceLabel(line.at, nowMs)}</small>
        </span>
        {line.detail && <small className="mt-[0.125rem] block truncate text-[0.6875rem] text-muted-2">
          {line.detail}
        </small>}
      </button>
    </li>)}
  </ul>
}
