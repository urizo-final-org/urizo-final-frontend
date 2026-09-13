import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { routes } from '../../app/routes'
import type { HistoryEntry, HistoryPage } from '../governance/api'
import type { KnowledgeTarget } from '../knowledge/admin-types'
import type { ObservabilityMetricsResponse } from '../orchestration/api'
import HomeDashboard from './HomeDashboard'

const at = '2026-09-11T05:00:00Z'
const entry = (id: string, domain: string, status = 'COMPLETED'): HistoryEntry => ({
  id, domain, kind: 'JOB', title: `요청 ${id}`, targetType: 'CONTENT', targetId: '1', jobId: id,
  status, jobStatus: status, stage: null, attempt: 1, stateVersion: 1, actorId: null, actorName: null,
  actorRole: null, createdAt: at, occurredAt: null, startedAt: null, updatedAt: null, finishedAt: null,
  feedback: null, errorCode: null, coverage: 'JOB_STATE',
})
const page: HistoryPage = { items: [entry('r1', 'RAG'), entry('l1', 'LLM_OPS', 'WAITING_APPROVAL'), entry('n1', 'NATURAL_CMS')], nextCursor: 'more', observedAt: at }
const metricResponse: ObservabilityMetricsResponse = {
  status: 'AVAILABLE', errorCode: null, from: '2026-09-10T05:00:00Z', to: at, environment: 'local',
  rows: [{ model: 'model-a', observationCount: 12, inputTokens: 900, outputTokens: 100, totalTokens: 1000, totalCost: 0.0123, p50LatencyMs: 1200, p95LatencyMs: 4200 },
    { model: 'model-b', observationCount: 4, inputTokens: null, outputTokens: null, totalTokens: null, totalCost: null, p50LatencyMs: null, p95LatencyMs: null }],
}
function props(): ComponentProps<typeof HomeDashboard> {
  return {
    actorName: '최고 관리자', role: 'SUPER_ADMIN',
    historyApi: { runs: vi.fn().mockResolvedValue(page), approvals: vi.fn() },
    knowledgeApi: { resolveTarget: vi.fn().mockResolvedValue({ kind: 'empty', what: 'project' }), listVersions: vi.fn() },
    profileApi: { getObservabilityMetrics: vi.fn().mockResolvedValue(metricResponse), listMonitoringJobs: vi.fn().mockResolvedValue({ schemaVersion: '1.0', observedAt: at, jobs: [] }) },
    codingApi: { runnerStatus: vi.fn().mockResolvedValue({ schemaVersion: '1.0', alive: false }) },
  }
}
function mount(input: ComponentProps<typeof HomeDashboard>) { return render(<MemoryRouter><HomeDashboard {...input} /></MemoryRouter>) }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done }); return { promise, resolve } }

test('home renders real bounded request composition and preserves completion/approval meaning', async () => {
  const input = props(); mount(input)
  expect(screen.getByRole('heading', { name: '운영 대시보드' })).toBeInTheDocument()
  expect(routes.find((route) => route.id === 'home')?.mock).toBeUndefined()
  expect(await screen.findByRole('img', { name: '최근 요청 3건의 기능별 구성' })).toBeInTheDocument()
  const composition = screen.getByRole('region', { name: '최근 요청 구성' })
  expect(within(composition).getAllByText('33.3%')).toHaveLength(3)
  expect(composition).toHaveTextContent('이전 요청 더 있음')
  expect(composition).toHaveTextContent('전체 누적·기간별 통계가 아닙니다')
  const approvals = screen.getByRole('region', { name: '승인 확인이 필요한 최근 요청' })
  expect(within(approvals).getByRole('link', { name: '요청 l1' })).toHaveAttribute('href', '/admin/llm-devops')
  expect(within(approvals).queryByText('요청 n1')).not.toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: '최근 AI 요청' })).getAllByText('종료')).toHaveLength(2)
  expect(input.historyApi.approvals).not.toHaveBeenCalled()
  expect(screen.queryByText('임시 목업')).not.toBeInTheDocument()
  expect(screen.queryByText('100%')).not.toBeInTheDocument()
})

test('metric switching uses server values and keeps missing tokens/cost distinct from zero', async () => {
  mount(props())
  expect(await screen.findByRole('group', { name: '모델별 호출 비교' })).toHaveTextContent('12')
  fireEvent.click(screen.getByRole('button', { name: /^토큰$/ }))
  const tokens = screen.getByRole('group', { name: '모델별 토큰 비교' })
  expect(tokens).toHaveTextContent('1,000')
  expect(tokens).toHaveTextContent('미수집')
  fireEvent.click(screen.getByRole('button', { name: /^비용$/ }))
  const costs = screen.getByRole('group', { name: '모델별 비용 비교' })
  expect(costs).toHaveTextContent('$0.0123')
  expect(costs).toHaveTextContent('미수집')
  expect(costs).not.toHaveTextContent('$0.00')
  expect(screen.getByText('RAG 품질 · 평가 대상과 날짜를 함께 확인하세요')).toBeInTheDocument()
})

test('general admins never request or expose SUPER_ADMIN metrics and monitoring', async () => {
  const input = { ...props(), role: 'GENERAL_ADMIN' as const }; mount(input)
  await screen.findByRole('img', { name: '최근 요청 3건의 기능별 구성' })
  expect(input.profileApi.getObservabilityMetrics).not.toHaveBeenCalled()
  expect(input.profileApi.listMonitoringJobs).not.toHaveBeenCalled()
  expect(screen.queryByRole('region', { name: '모델별 사용량' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '모니터링 ↗' })).not.toBeInTheDocument()
  expect(input.codingApi.runnerStatus).toHaveBeenCalledOnce()
})

test('one unavailable panel does not suppress available panels or invent zero values', async () => {
  const input = props()
  input.profileApi.getObservabilityMetrics = vi.fn().mockResolvedValue({ ...metricResponse, status: 'UNAVAILABLE', errorCode: 'UPSTREAM_TIMEOUT' })
  input.historyApi.runs = vi.fn().mockRejectedValue(new Error('history offline'))
  mount(input)
  expect(await screen.findByText(/모델 계측을 조회할 수 없습니다/)).toBeInTheDocument()
  expect(screen.queryByRole('group', { name: '모델별 호출 비교' })).not.toBeInTheDocument()
  expect(await screen.findByText('응답 없음')).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /기능별 구성/ })).not.toBeInTheDocument()
  expect(screen.getByText('최근 AI 요청', { selector: '.dashboard-stat-top span' }).closest('.dashboard-stat')).toHaveTextContent('—')
})

test('an empty response has an empty state and no misleading full donut', async () => {
  const input = props()
  input.historyApi.runs = vi.fn().mockResolvedValue({ ...page, items: [], nextCursor: null })
  input.profileApi.getObservabilityMetrics = vi.fn().mockResolvedValue({ ...metricResponse, rows: [] })
  mount(input)
  expect(await screen.findByText('선택 기간에 관측된 모델 호출이 없습니다.')).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /기능별 구성/ })).not.toBeInTheDocument()
  expect(screen.getByText('조회한 최근 요청에는 승인 대기가 없습니다.')).toBeInTheDocument()
})

test('changing the period aborts old metrics and ignores an out-of-order response', async () => {
  const first = deferred<ObservabilityMetricsResponse>()
  const input = props()
  input.profileApi.getObservabilityMetrics = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ ...metricResponse, rows: [{ ...metricResponse.rows[0], model: 'new-period' }] })
  const view = mount(input)
  await waitFor(() => expect(input.profileApi.getObservabilityMetrics).toHaveBeenCalledOnce())
  const oldSignal = vi.mocked(input.profileApi.getObservabilityMetrics).mock.calls[0][3]
  fireEvent.change(screen.getByRole('combobox', { name: '모델 사용량 기간' }), { target: { value: '7' } })
  expect(await screen.findByTitle('new-period')).toBeInTheDocument()
  expect(oldSignal?.aborted).toBe(true)
  const [from, to] = vi.mocked(input.profileApi.getObservabilityMetrics).mock.calls[1]
  expect(Date.parse(to) - Date.parse(from)).toBe(7 * 86_400_000)
  await act(async () => first.resolve(metricResponse))
  expect(screen.queryByText('model-a')).not.toBeInTheDocument()
  const lastSignal = vi.mocked(input.profileApi.getObservabilityMetrics).mock.calls[1][3]
  view.unmount()
  expect(lastSignal?.aborted).toBe(true)
})

test('RAG requires a project choice and reads the explicitly active version without using score', async () => {
  const input = props()
  const projects = [{ projectId: 'p1', name: '첫 프로젝트', status: 'ACTIVE' }, { projectId: 'p2', name: '둘째 프로젝트', status: 'ACTIVE' }]
  const base = { projectId: 'p2', knowledgeBaseId: 'kb2', name: '선택 KB', activeVersionId: 'v2' }
  input.knowledgeApi.resolveTarget = vi.fn().mockImplementation(async (chosen) => chosen?.projectId === 'p2'
    ? { kind: 'ready', projectId: 'p2', knowledgeBaseId: 'kb2', name: '선택 KB', project: projects[1], projects, bases: [base] } satisfies KnowledgeTarget
    : { kind: 'choose', what: 'project', projects } satisfies KnowledgeTarget)
  input.knowledgeApi.listVersions = vi.fn().mockResolvedValue({ schemaVersion: '1.0', traceId: 'test', items: [
    { knowledgeVersionId: 'v3', knowledgeBaseId: 'kb2', connectorVersionId: 'cv', versionNumber: 3, status: 'BUILDING', documentCount: 0, chunkCount: 0, createdAt: at, score: 100 },
    { knowledgeVersionId: 'v2', knowledgeBaseId: 'kb2', connectorVersionId: 'cv', versionNumber: 2, status: 'ACTIVE', documentCount: 518, chunkCount: 999, createdAt: at, activatedAt: at, score: 100 },
  ] })
  mount(input)
  const selector = await screen.findByRole('combobox', { name: '대시보드 RAG 프로젝트' })
  expect(input.knowledgeApi.listVersions).not.toHaveBeenCalled()
  fireEvent.change(selector, { target: { value: 'p2' } })
  expect(await screen.findByText('활성 v2')).toBeInTheDocument()
  expect(screen.getByText('518')).toBeInTheDocument()
  expect(screen.getByText('999')).toBeInTheDocument()
  expect(screen.getByText('빌드 중')).toBeInTheDocument()
  expect(input.knowledgeApi.listVersions).toHaveBeenCalledWith('kb2')
  expect(screen.queryByText('100%')).not.toBeInTheDocument()
})
