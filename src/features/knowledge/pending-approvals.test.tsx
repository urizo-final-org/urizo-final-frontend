import { render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { expect, test, vi } from 'vitest'
import type { KnowledgeAdminApi } from './admin-api'
import { usePendingApprovals } from './pending-approvals'

function Probe({ api, enabled }: { api: KnowledgeAdminApi; enabled: boolean }) {
  const requests = usePendingApprovals(api, enabled)
  // 종이 그리는 줄 수와, 그 줄이 누구 이름을 달게 되는지를 함께 단언한다.
  const shown = requests == null
    ? 'none'
    : `${requests.length}:${requests.map((request) => request.requestedByName).join(',')}`
  return <span data-testid="count">{shown}</span>
}

function api(overrides: Partial<Record<keyof KnowledgeAdminApi, unknown>> = {}) {
  return {
    listProjects: vi.fn().mockResolvedValue({ items: [{ projectId: 'p-1' }] }),
    listKnowledgeBases: vi.fn().mockResolvedValue({ items: [{ knowledgeBaseId: 'kb-1' }] }),
    listVersions: vi.fn().mockResolvedValue({
      items: [{ status: 'APPROVAL_PENDING' }, { status: 'ACTIVE' }],
    }),
    listActivationRequests: vi.fn().mockResolvedValue({ items: [] }),
    ...overrides,
  } as unknown as KnowledgeAdminApi
}

test('it reports the open activation requests', async () => {
  const calls = api({
    listActivationRequests: vi.fn().mockResolvedValue({
      items: [{ requestId: 'r-1', requestedByName: '일반 관리자' }],
    }),
  })
  render(<Probe api={calls} enabled />)
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1:일반 관리자'))
})

/**
 * 승인 대기 버전은 종이 답하는 질문이 아니다 — 버전 표에 늘 떠 있어 언제든 볼 수 있는
 * 상태이고, 상시 켜져 있는 숫자는 방금 온 요청을 가린다. 세지 않을 뿐 아니라 **읽지도 않는다**:
 * 지식베이스마다 돌던 조회 한 번이 통째로 사라진다.
 */
test('it never reads the version list', async () => {
  const calls = api()
  render(<Probe api={calls} enabled />)
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0:'))
  expect(calls.listVersions).not.toHaveBeenCalled()
})

/**
 * 껍데기 알림은 화면 안 드롭다운과 달리 대상을 하나로 좁힐 수 없다. 프로젝트가 둘이면
 * resolveTarget이 'choose'를 주므로 그 경로로는 영영 0이 된다 — 실제로 이 환경에서
 * 알림이 안 뜨는 것으로 드러났다(9/7).
 */
test('it gathers requests across every project and knowledge base', async () => {
  const calls = api({
    listProjects: vi.fn().mockResolvedValue({ items: [{ projectId: 'p-1' }, { projectId: 'p-2' }] }),
    listKnowledgeBases: vi.fn()
      .mockResolvedValueOnce({ items: [{ knowledgeBaseId: 'kb-1' }] })
      .mockResolvedValueOnce({ items: [{ knowledgeBaseId: 'kb-2' }] }),
    listActivationRequests: vi.fn()
      .mockResolvedValueOnce({ items: [{ requestId: 'r-1', requestedByName: '일반 관리자' }] })
      .mockResolvedValueOnce({ items: [{ requestId: 'r-2', requestedByName: '콘텐츠 담당자' }] }),
  })
  render(<Probe api={calls} enabled />)
  await waitFor(() => expect(screen.getByTestId('count'))
    .toHaveTextContent('2:일반 관리자,콘텐츠 담당자'))
})

test('a disabled probe calls nothing', async () => {
  const calls = api()
  render(<Probe api={calls} enabled={false} />)
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('none'))
  expect(calls.listProjects).not.toHaveBeenCalled()
})

/** 편의 표시 하나 때문에 껍데기가 깨지면 안 된다. 실패는 조용히 없는 셈 친다. */
test('a failing read leaves the bell silent instead of throwing', async () => {
  render(<Probe api={api({ listProjects: vi.fn().mockRejectedValue(new Error('down')) })} enabled />)
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('none'))
})

/** 백엔드가 이 엔드포인트를 아직 배포하지 않은 환경에서도 껍데기는 그대로 떠야 한다. */
test('a missing activation-request endpoint reports absent rather than crashing', async () => {
  render(<Probe api={api({
    listActivationRequests: vi.fn().mockRejectedValue(new Error('404')),
  })} enabled />)
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('none'))
})

/** RagAdminPanel과 같은 버그를 막는다 — 두 번째 마운트에서 setState가 영원히 막히던 건. */
test('it still reports under StrictMode double mounting', async () => {
  const calls = api({
    listActivationRequests: vi.fn().mockResolvedValue({
      items: [{ requestId: 'r-1', requestedByName: '일반 관리자' }],
    }),
  })
  render(<StrictMode><Probe api={calls} enabled /></StrictMode>)
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1:일반 관리자'))
})
