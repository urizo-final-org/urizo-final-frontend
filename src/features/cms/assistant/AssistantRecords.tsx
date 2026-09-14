import type { NaturalCmsRecord } from './api'

/**
 * 기록 한 줄이 화면에서 갖는 상태.
 *
 * 서버 Job 상태를 그대로 쓰지 않는다. `ACTIVE`는 도는 중일 수도, 노드가 실패한 뒤 아무도
 * 닫지 않아 남은 것일 수도 있어서 시간으로 갈라야 한다.
 */
export type RecordState = 'running' | 'waiting' | 'stalled' | 'approved' | 'rejected'

export function recordState(
  record: NaturalCmsRecord, stalledAfterMs: number, now: number,
): RecordState {
  if (record.status === 'WAITING_APPROVAL') return 'waiting'
  if (record.status === 'COMPLETED') return 'approved'
  if (record.status === 'REJECTED') return 'rejected'
  const moved = Date.parse(record.updatedAt)
  if (Number.isNaN(moved)) return 'running'
  return now - moved > stalledAfterMs ? 'stalled' : 'running'
}

const LABELS: Record<RecordState, string> = {
  running: '도는 중',
  waiting: '대기',
  stalled: '멎음',
  approved: '승인',
  rejected: '반려',
}

const TONES: Record<RecordState, string> = {
  running: 'text-muted-2',
  waiting: 'text-[#8a6014]',
  stalled: 'text-muted-3',
  approved: 'text-[#2f6b4f]',
  rejected: 'text-[#a3564f]',
}

/** 몇 분 전인지만 말한다. 정확한 시각은 거버넌스 실행 이력에 있다. */
export function sinceLabel(iso: string, now: number) {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ''
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

/**
 * 이 화면에서 내가 보낸 지난 요청.
 *
 * 대기와 멎음에만 단추를 붙인다. 그 둘이 사람이 손대야 끝나는 상태이고, 목록이 곧 돌아가는
 * 길이라 「승인 대기 1건」 같은 배너를 따로 두지 않는다.
 */
export default function AssistantRecords({ records, now, stalledAfterMs, busy, onResume, onClose }: {
  records: NaturalCmsRecord[]
  now: number
  stalledAfterMs: number
  /** 닫는 중인 Job. 두 번 눌러 같은 요청을 두 번 닫지 않게 한다. */
  busy: string | null
  onResume: (jobId: string) => void
  onClose: (jobId: string) => void
}) {
  if (records.length === 0) return null
  return <section className="mt-4 border-t border-line-soft pt-[0.875rem]">
    <div className="flex items-baseline gap-[0.375rem]">
      <h3 className="m-0 text-[0.71875rem] font-semibold text-body">기록</h3>
      <span className="rounded bg-sub px-[0.3125rem] py-[0.0625rem] text-[0.625rem] font-semibold text-muted-2">내 요청만</span>
    </div>
    <ul className="m-0 mt-[0.4375rem] list-none p-0">
      {records.map((record) => {
        const state = recordState(record, stalledAfterMs, now)
        return <li
          key={record.jobId}
          className="grid grid-cols-[1fr_auto] items-baseline gap-x-[0.4375rem] border-b border-dashed border-line-soft py-[0.3125rem] last:border-b-0"
        >
          <span className="truncate text-[0.71875rem] text-body" title={record.requestText}>{record.requestText}</span>
          <span className={`text-[0.65625rem] font-semibold ${TONES[state]}`}>
            {LABELS[state]} · {sinceLabel(record.updatedAt, now)}
          </span>
          {state === 'waiting' && <button
            type="button"
            className="col-span-2 mt-[0.1875rem] justify-self-start rounded border border-teal-fg px-[0.375rem] py-[0.0625rem] text-[0.65625rem] font-semibold text-teal-fg hover:bg-teal-bg"
            onClick={() => onResume(record.jobId)}
          >이어서 처리</button>}
          {state === 'stalled' && <button
            type="button"
            className="col-span-2 mt-[0.1875rem] justify-self-start rounded border border-btn-line px-[0.375rem] py-[0.0625rem] text-[0.65625rem] font-semibold text-muted-2 hover:bg-sub"
            onClick={() => onClose(record.jobId)}
            disabled={busy === record.jobId}
          >{busy === record.jobId ? '닫는 중…' : '닫기'}</button>}
        </li>
      })}
    </ul>
    <p className="m-0 mt-[0.4375rem] text-[0.625rem] leading-[1.5] text-muted-3">
      최근 {records.length}건만 남습니다. 지난 요청은 거버넌스 › 실행 이력에서 볼 수 있습니다.
    </p>
  </section>
}
