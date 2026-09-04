import type { CodingNotification } from './api'

/**
 * What the bell counts and how each line reads.
 *
 * The "read" mark lives in this browser, not on the server. A server-side mark would need a
 * table per account, and what it would buy - the same badge on a second machine - is not
 * something a demo with one browser per administrator ever sees.
 */
const SEEN_KEY = 'axms.coding.notifications.seenAt'

export function lastSeenAt(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY)
  }
  catch {
    // A browser with site data blocked still gets a working screen; everything reads as new.
    return null
  }
}

export function markSeen(at: string = new Date().toISOString()): void {
  try {
    window.localStorage.setItem(SEEN_KEY, at)
  }
  catch { /* nothing to do: the count simply stays as it was */ }
}

/** Newer than the last look. An item with no time is counted, never silently dropped. */
export function unseen(items: CodingNotification[], seenAt: string | null): CodingNotification[] {
  if (!seenAt) return items
  const seen = Date.parse(seenAt)
  if (!Number.isFinite(seen)) return items
  return items.filter((item) => {
    if (!item.occurredAt) return true
    const occurred = Date.parse(item.occurredAt)
    return !Number.isFinite(occurred) || occurred > seen
  })
}

const decisionWords: Record<string, string> = {
  APPROVED: '승인했습니다',
  REJECTED: '반려했습니다',
}

/**
 * One line, in the words an administrator uses. The person is named because "누가 승인했나"
 * is the question the approval ledger exists to answer; the role alone answers a different one.
 */
export function notificationSentence(item: CodingNotification): string {
  if (item.kind === 'APPROVAL_WAITING') {
    return `${item.stage ?? '요청'} 단계에서 승인을 기다리고 있습니다`
  }
  const who = item.actorName ?? roleLabel(item.actorRole)
  const what = item.stage ? `${item.stage} 단계를 ` : ''
  const verb = decisionWords[item.decision ?? ''] ?? '처리했습니다'
  return `${who}님이 ${what}${verb}`
}

function roleLabel(role?: string): string {
  if (role === 'SUPER_ADMIN') return '최고 관리자'
  if (role === 'GENERAL_ADMIN') return '일반 관리자'
  return '관리자'
}

/** "3분 전". Absolute times make a reader do arithmetic to answer "방금인가?". */
export function sinceLabel(occurredAt: string | undefined, nowMs: number): string {
  if (!occurredAt) return ''
  const at = Date.parse(occurredAt)
  if (!Number.isFinite(at)) return ''
  const minutes = Math.floor((nowMs - at) / 60_000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}
