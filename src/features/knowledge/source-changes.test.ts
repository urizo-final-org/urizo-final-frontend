import { expect, test } from 'vitest'
import { changedBases } from './source-changes'
import type { KnowledgeBase } from './admin-types'

function base(overrides: Partial<KnowledgeBase>): KnowledgeBase {
  return {
    knowledgeBaseId: 'kb-1', projectId: 'p-1', name: '중소벤처기업부',
    activeVersionId: 'kv-1', ...overrides,
  }
}

// 알림 대상은 "변경이 있는" 지식베이스뿐이다(AI02-022). 요약이 없는 것(미점검),
// 0건 요약(이상 없음)을 종에 올리면 알림이 잡음이 된다.
test('only bases with actual changes become notices', () => {
  const notices = changedBases([
    base({ knowledgeBaseId: 'kb-unchecked' }),
    base({
      knowledgeBaseId: 'kb-quiet',
      sourceChangeSummary: {
        checkedAt: '2026-09-13T09:00:00Z', comparedVersion: 1,
        added: 0, modified: 0, missing: 0,
      },
    }),
    base({
      knowledgeBaseId: 'kb-changed',
      sourceChangeSummary: {
        checkedAt: '2026-09-13T09:00:00Z', comparedVersion: 1,
        added: 3, modified: 5, missing: 1,
      },
    }),
  ])

  expect(notices).toHaveLength(1)
  expect(notices[0].knowledgeBaseId).toBe('kb-changed')
  expect(notices[0].summary.added).toBe(3)
})
