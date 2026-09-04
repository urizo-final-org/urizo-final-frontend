import { beforeEach, expect, test } from 'vitest'
import type { CodingNotification } from './api'
import { lastSeenAt, markSeen, notificationSentence, sinceLabel, unseen } from './notifications'

function decided(occurredAt: string, overrides: Partial<CodingNotification> = {}): CodingNotification {
  return {
    kind: 'APPROVAL_DECIDED',
    jobId: 'aaaaaaaa-1111-4111-8111-111111111111',
    stage: '코드',
    decision: 'APPROVED',
    actorName: '최고 관리자',
    actorRole: 'SUPER_ADMIN',
    occurredAt,
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

test('everything is new until the reader has looked once', () => {
  expect(lastSeenAt()).toBeNull()
  const items = [decided('2026-09-03T01:00:00Z'), decided('2026-09-02T01:00:00Z')]

  expect(unseen(items, lastSeenAt())).toHaveLength(2)
})

test('only what happened after the last look is counted', () => {
  markSeen('2026-09-03T00:30:00Z')

  const items = [decided('2026-09-03T01:00:00Z'), decided('2026-09-03T00:00:00Z')]

  expect(unseen(items, lastSeenAt())).toHaveLength(1)
})

/* A row without a time is a row we cannot date; dropping it would hide news silently. */
test('an undated item is counted rather than dropped', () => {
  markSeen('2026-09-03T00:30:00Z')

  expect(unseen([decided('2026-09-03T00:00:00Z', { occurredAt: undefined })], lastSeenAt()))
    .toHaveLength(1)
})

test('a decision reads as a sentence naming the person', () => {
  expect(notificationSentence(decided('2026-09-03T01:00:00Z')))
    .toBe('최고 관리자님이 코드 단계를 승인했습니다')
  expect(notificationSentence(decided('2026-09-03T01:00:00Z', { decision: 'REJECTED' })))
    .toBe('최고 관리자님이 코드 단계를 반려했습니다')
})

/* The name can be missing when the account cannot be read; the role still says who acted. */
test('a missing name falls back to the role, never to a blank', () => {
  expect(notificationSentence(decided('2026-09-03T01:00:00Z', { actorName: undefined })))
    .toBe('최고 관리자님이 코드 단계를 승인했습니다')
  expect(notificationSentence(decided('2026-09-03T01:00:00Z', {
    actorName: undefined, actorRole: 'GENERAL_ADMIN',
  }))).toBe('일반 관리자님이 코드 단계를 승인했습니다')
})

test('a waiting approval says it is waiting, not who decided', () => {
  expect(notificationSentence({
    kind: 'APPROVAL_WAITING',
    jobId: 'bbbbbbbb-2222-4222-8222-222222222222',
    stage: '계획',
    occurredAt: '2026-09-03T01:00:00Z',
  })).toBe('계획 단계에서 승인을 기다리고 있습니다')
})

test('elapsed time is said the way a person would say it', () => {
  const now = Date.parse('2026-09-03T02:00:00Z')
  expect(sinceLabel('2026-09-03T01:59:30Z', now)).toBe('방금')
  expect(sinceLabel('2026-09-03T01:57:00Z', now)).toBe('3분 전')
  expect(sinceLabel('2026-09-03T00:00:00Z', now)).toBe('2시간 전')
  expect(sinceLabel('2026-09-01T02:00:00Z', now)).toBe('2일 전')
  expect(sinceLabel(undefined, now)).toBe('')
})
