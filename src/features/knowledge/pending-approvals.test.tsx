import { render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { expect, test, vi } from 'vitest'
import type { KnowledgeAdminApi } from './admin-api'
import { usePendingApprovals } from './pending-approvals'

function Probe({ api, enabled }: { api: KnowledgeAdminApi; enabled: boolean }) {
  const count = usePendingApprovals(api, enabled)
  // 뱃지가 실제로 그리는 값(합계)과 축별 값을 함께 단언한다.
  return <span data-testid="count">{count == null ? 'none' : `${count.approvals + count.requests}/${count.approvals}/${count.requests}`}</span>
}

function api(overrides: Partial<Record<keyof KnowledgeAdminApi, unknown>> = {}) {
  return {
    listProjects: vi.fn().mockResolvedValue({ items: [{ projectId: 'p-1' }] }),
    listKnowledgeBases: vi.fn().mockResolvedValue({ items: [{ knowledgeBaseId: 'kb-1' }] }),
    listVersions: vi.fn().mockResolvedValue({
      items: [{ status: 'APPROVAL_PENDING' }, { status: 'ACTIVE' }, { status: 'ARCHIVED' }],
    }),
    listActivationRequests: vi.fn().mockResolvedValue({ items: [] }),
    ...overrides,
  } as unknown as KnowledgeAdminApi
}

test('it counts only versions waiting for approval', async () => {
  render(<Probe api={api()} enabled />)
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1/1/0'))
})

/** 축이 둘이지만 뱃지는 하나다 — 답하는 질문이 "들어가 볼 일이 있나" 하나이기 때문이다. */
test('it adds open activation requests to the same badge', async () => {
  const calls = api({
    listActivationRequests: vi.fn().mockResolvedValue({ items: [{ requestId: 'r-1' }, { requestId: 'r-2' }] }),
  })
  render(<Probe api={calls} enabled />)
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('3/1/2'))
})

/**
 * 백엔드가 아직 이 엔드포인트를 배포하지 않은 환경에서 404 하나로 기존 승인 대기 뱃지가
 * 통째로 꺼지면 안 된다. 요청 축만 0이 되고 나머지는 산다.
 */
test('a missing activation-request endpoint keeps the approval count alive', async () => {
  const calls = api({ listActivationRequests: vi.fn().mockRejectedValue(new Error('404')) })
  render(<Probe api={calls} enabled />)
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1/1/0'))
})

/**
 * 껍데기 뱃지는 화면 안 드롭다운과 달리 대상을 하나로 좁힐 수 없다. 프로젝트가 둘이면
 * resolveTarget이 'choose'를 주므로 그 경로로는 영영 0이 된다 — 실제로 이 환경에서
 * 뱃지가 안 뜨는 것으로 드러났다(9/7).
 */
test('it sums across every project and knowledge base', async () => {
  const calls = api({
    listProjects: vi.fn().mockResolvedValue({ items: [{ projectId: 'p-1' }, { projectId: 'p-2' }] }),
    listKnowledgeBases: vi.fn()
      .mockResolvedValueOnce({ items: [{ knowledgeBaseId: 'kb-1' }] })
      .mockResolvedValueOnce({ items: [{ knowledgeBaseId: 'kb-2' }] }),
    listVersions: vi.fn()
      .mockResolvedValueOnce({ items: [{ status: 'APPROVAL_PENDING' }, { status: 'ACTIVE' }] })
      .mockResolvedValueOnce({ items: [{ status: 'APPROVAL_PENDING' }] }),
  })
  render(<Probe api={calls} enabled />)
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2/2/0'))
})

test('a disabled probe calls nothing', async () => {
  const calls = api()
  render(<Probe api={calls} enabled={false} />)
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('none'))
  expect(calls.listProjects).not.toHaveBeenCalled()
})

/** 편의 표시 하나 때문에 껍데기가 깨지면 안 된다. 실패는 조용히 없는 셈 친다. */
test('a failing read leaves the badge absent instead of throwing', async () => {
  render(<Probe api={api({ listProjects: vi.fn().mockRejectedValue(new Error('down')) })} enabled />)
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('none'))
})

/** RagAdminPanel과 같은 버그를 막는다 — 두 번째 마운트에서 setState가 영원히 막히던 건. */
test('it still reports under StrictMode double mounting', async () => {
  render(<StrictMode><Probe api={api()} enabled /></StrictMode>)
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1/1/0'))
})
