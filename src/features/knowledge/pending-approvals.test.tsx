import { render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { expect, test, vi } from 'vitest'
import type { KnowledgeAdminApi } from './admin-api'
import { usePendingApprovals } from './pending-approvals'

function Probe({ api, enabled }: { api: KnowledgeAdminApi; enabled: boolean }) {
  const count = usePendingApprovals(api, enabled)
  return <span data-testid="count">{count == null ? 'none' : String(count)}</span>
}

function api(overrides: Partial<Record<keyof KnowledgeAdminApi, unknown>> = {}) {
  return {
    listProjects: vi.fn().mockResolvedValue({ items: [{ projectId: 'p-1' }] }),
    listKnowledgeBases: vi.fn().mockResolvedValue({ items: [{ knowledgeBaseId: 'kb-1' }] }),
    listVersions: vi.fn().mockResolvedValue({
      items: [{ status: 'APPROVAL_PENDING' }, { status: 'ACTIVE' }, { status: 'ARCHIVED' }],
    }),
    ...overrides,
  } as unknown as KnowledgeAdminApi
}

test('it counts only versions waiting for approval', async () => {
  render(<Probe api={api()} enabled />)
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
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
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'))
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
  await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
})
