import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import GovernanceWorkspace from './GovernanceWorkspace'
import type { HistoryClient, HistoryEntry, HistoryPage } from './api'

const entry: HistoryEntry = {
  id: 'natural-job:00000000-0000-0000-0000-000000000001', domain: 'NATURAL_CMS', kind: 'NATURAL_CMS_JOB', title: '본문 수정 요청',
  targetType: 'CONTENT', targetId: '1', jobId: '00000000-0000-0000-0000-000000000001', status: 'ACTIVE', jobStatus: 'ACTIVE',
  stage: null, attempt: 1, stateVersion: 2, actorId: null, actorName: null, actorRole: null,
  createdAt: '2026-09-10T05:00:00Z', occurredAt: null, startedAt: null, updatedAt: '2026-09-10T05:01:00Z', finishedAt: null,
  feedback: null, errorCode: null, coverage: 'JOB_STATE',
}
const page = (items: HistoryEntry[] = [], nextCursor: string | null = null): HistoryPage => ({ items, nextCursor, observedAt: '2026-09-10T06:00:00Z' })
const client = (): HistoryClient => ({ approvals: vi.fn().mockResolvedValue(page()), runs: vi.fn().mockResolvedValue(page()) })
function show(api: HistoryClient, route: 'runs' | 'approvals' = 'approvals', role: 'SUPER_ADMIN' | 'GENERAL_ADMIN' = 'GENERAL_ADMIN') {
  return render(<MemoryRouter><GovernanceWorkspace route={route} api={api} role={role} /></MemoryRouter>)
}

test('approval tabs are read-only and explicitly disclose incomplete source coverage', async () => {
  const api = client(); show(api)
  expect(screen.getByRole('heading', { name: '승인 내역' })).toBeInTheDocument()
  await screen.findByText('조회 조건에 해당하는 이력이 없습니다.')
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['RAG', 'LLM Ops', '자연어 CMS'])
  fireEvent.click(screen.getByRole('tab', { name: '자연어 CMS' }))
  await waitFor(() => expect(api.approvals).toHaveBeenLastCalledWith('NATURAL_CMS', expect.anything()))
  expect(screen.getByText(/현재 보존된 마지막 승인 정보만/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^(승인|반려|재시도|취소)$/ })).not.toBeInTheDocument()
})

test('execution categories, search, pagination and refresh use server reads', async () => {
  const api = client(); vi.mocked(api.runs).mockResolvedValue(page([entry], 'next-token')); show(api, 'runs')
  await screen.findByText(entry.title)
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['전체', 'CMS 변경', 'AI 실행'])
  fireEvent.click(screen.getByRole('button', { name: '다음' }))
  await waitFor(() => expect(api.runs).toHaveBeenLastCalledWith('ALL', expect.objectContaining({ cursor: 'next-token' })))
  await screen.findByText(entry.title)
  fireEvent.change(screen.getByRole('textbox', { name: '이력 검색' }), { target: { value: '수정' } })
  fireEvent.click(screen.getByRole('button', { name: '검색' }))
  await waitFor(() => expect(api.runs).toHaveBeenLastCalledWith('ALL', expect.objectContaining({ cursor: undefined, query: '수정' })))
  await screen.findByText(entry.title)
  fireEvent.click(screen.getByRole('tab', { name: 'CMS 변경' }))
  await waitFor(() => expect(api.runs).toHaveBeenLastCalledWith('CMS', expect.objectContaining({ cursor: undefined })))
  await screen.findByText(entry.title)
  const before = vi.mocked(api.runs).mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: '새로고침' }))
  await waitFor(() => expect(api.runs).toHaveBeenCalledTimes(before + 1))
})

test.each(['GENERAL_ADMIN', 'SUPER_ADMIN'] as const)('details preserve UNKNOWN and restrict monitoring links for %s', async (role) => {
  const api = client(); vi.mocked(api.runs).mockResolvedValue(page([entry])); show(api, 'runs', role)
  fireEvent.click(await screen.findByRole('button', { name: `${entry.title} 상세` }))
  const detail = within(screen.getByRole('region', { name: '이력 상세' }))
  expect(detail.getAllByText('UNKNOWN').length).toBeGreaterThan(3)
  expect(detail.getByRole('link', { name: '원래 기능으로 이동' })).toHaveAttribute('href', '/admin/contents')
  const monitoring = detail.queryByRole('link', { name: 'Node · Tool · 재시도 모니터링' })
  if (role === 'SUPER_ADMIN') expect(monitoring).toHaveAttribute('href', `/admin/models?tab=monitoring&jobId=${entry.jobId}`)
  else expect(monitoring).not.toBeInTheDocument()
  expect(detail.queryByText('실행 중')).not.toBeInTheDocument()
})

test('late responses from an old tab cannot overwrite the selected tab', async () => {
  const api = client(); let resolveOld!: (result: HistoryPage) => void
  vi.mocked(api.approvals).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve })).mockResolvedValue(page())
  show(api); fireEvent.click(screen.getByRole('tab', { name: 'LLM Ops' }))
  await screen.findByText('조회 조건에 해당하는 이력이 없습니다.')
  await act(async () => resolveOld(page([entry])))
  expect(screen.queryByText(entry.title)).not.toBeInTheDocument()
})

test('failures are not presented as an empty successful list and refresh retries', async () => {
  const api = client(); vi.mocked(api.approvals).mockRejectedValueOnce(new Error('Migration 미적용')).mockResolvedValue(page())
  show(api); expect(await screen.findByRole('alert')).toHaveTextContent('이력 조회 실패')
  expect(screen.queryByText('조회 조건에 해당하는 이력이 없습니다.')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '새로고침' }))
  await screen.findByText('조회 조건에 해당하는 이력이 없습니다.')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('tabs support keyboard selection', async () => {
  show(client()); await screen.findByText('조회 조건에 해당하는 이력이 없습니다.')
  fireEvent.keyDown(screen.getByRole('tab', { name: 'RAG' }), { key: 'End' })
  expect(screen.getByRole('tab', { name: '자연어 CMS' })).toHaveFocus()
  expect(screen.getByRole('tab', { name: '자연어 CMS' })).toHaveAttribute('aria-selected', 'true')
})
