import { expect, test, vi } from 'vitest'
import { KnowledgeAdminApi } from './admin-api'

/**
 * 프로젝트 목록에서 감춘 항목이 실제로 빠지는지 본다(AI02-024).
 *
 * <p>이 한 줄이 틀리면 화면에서 프로젝트가 통째로 사라지거나, 감췄어야 할 것이 그대로 남는다.
 * 둘 다 눈으로만 확인하기 쉬운 종류가 아니라 여기서 고정한다.
 */
vi.mock('../../shared/api/session', () => ({
  fetchWithSessionRefresh: vi.fn(async () => new Response(JSON.stringify({
    items: [
      { projectId: 'p-1', name: '관광 포털', status: 'ACTIVE' },
      { projectId: 'p-2', name: '중기부 지원사업', status: 'ACTIVE' },
      { projectId: 'p-3', name: '중소벤처기업부', status: 'ACTIVE' },
    ],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}))

test('감춘 프로젝트만 목록에서 빠지고 나머지는 그대로 온다', async () => {
  const api = new KnowledgeAdminApi('token', () => {}, () => {})

  const { items } = await api.listProjects()

  // 서버 응답에는 셋이 다 있다 — 지우는 것이 아니라 화면에서만 빼는 것이다.
  expect(items.map((item) => item.name)).toEqual(['관광 포털', '중소벤처기업부'])
  expect(items.some((item) => item.name === '중기부 지원사업')).toBe(false)
})
